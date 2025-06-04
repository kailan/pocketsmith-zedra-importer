import * as zedra from './zedra';
import * as pocketsmith from './pocketsmith';

type CategoryMap = { [key: string]: number };

class TransactionConverter {
  date: string;
  payee: string;
  categoryMap: CategoryMap;

  constructor(date: Date, payee: string, categoryMap: CategoryMap) {
    const dateNoTime = date.toString().split('T')[0];
    if (!dateNoTime) {
      throw new Error(`Invalid date format: ${date}`);
    } else {
      this.date = dateNoTime;
    }

    this.payee = payee;
    this.categoryMap = categoryMap;
  }

  convertPayslipModuleToTransactionSet(
    module: zedra.PayModule,
    type: 'addition' | 'deduction',
  ): pocketsmith.Transaction[] {
    return module.moduleLines.filter((item) => item.total > 0).map((item) => {
      if (this.categoryMap[item.description] === undefined) {
        throw new Error(`Category mapping for payslip line "${item.description}" not found`);
      }

      const categoryId = this.categoryMap[item.description];
      if (!categoryId) {
        throw new Error(`Category ID for payslip line "${item.description}" not found in category map`);
      }

      const amount = type === 'addition' ? item.total : -item.total;
      return {
        payee: this.payee,
        amount: amount,
        date: this.date,
        is_transfer: false,
        category_id: categoryId,
        needs_review: config.transactionsNeedReview
      };
    });
  }

  withAdditions(
    module: zedra.PayModule,
  ): pocketsmith.Transaction[] {
    return this.convertPayslipModuleToTransactionSet(module, 'addition');
  }

  withDeductions(
    module: zedra.PayModule,
  ): pocketsmith.Transaction[] {
    return this.convertPayslipModuleToTransactionSet(module, 'deduction');
  }
}

import * as config from '../config.json'

async function run() {
  // Read the payslip from stdin
  const payslip = await readPayslipFromStdin();

  // Fetch user ID from PocketSmith
  const userId = (await pocketsmith.getAuthorisedUser()).id;

  // Find the transaction account to import to
  console.log(`\nLooking for transaction account ${config.transactionAccountName}...`);
  const transactionAccounts = await pocketsmith.listTransactionAccounts(userId);
  const transactionAccount = transactionAccounts.find(
    (account) => account.name === config.transactionAccountName
  );

  if (!transactionAccount) {
    throw new Error(`Transaction account "${config.transactionAccountName}" not found in PocketSmith`);
  }
  console.log('Transaction account:', { id: transactionAccount.id, name: transactionAccount.name });

  // Map payslip categories to PocketSmith categories
  console.log('\nMapping payslip categories to PocketSmith categories...');
  const categories = await pocketsmith.listCategories(userId);

  const categoryMap: CategoryMap = {};
  for (const [zedraCategory, psCategoryName] of Object.entries(config.payslipLineToCategoryNameMapping)) {
    const psCategory = categories.find((cat) => cat.title === psCategoryName);
    if (psCategory) {
      categoryMap[zedraCategory] = psCategory.id;
    } else {
      throw new Error(`Can't map ${zedraCategory}: Category "${psCategoryName}" not found in PocketSmith`);
    }
  }
  console.log('Generated category mapping:', categoryMap);

  // Find the net pay category
  const netPayCategoryId = categories.find((cat) => cat.title === config.netPayCategoryName)?.id;
  if (!netPayCategoryId) {
    throw new Error(`Net pay category "${config.netPayCategoryName}" not found in PocketSmith`);
  }

  // Convert payslip lines to PocketSmith transactions
  const converter = new TransactionConverter(
    payslip.payDate,
    config.employerPayeeName,
    categoryMap,
  );
  const transactions = [
    ...converter.withAdditions(payslip.grossPayModule),
    ...converter.withDeductions(payslip.taxAndNIModule),
    ...converter.withDeductions(payslip.pensionModule),
    ...converter.withDeductions(payslip.deductionModule),
    ...converter.withDeductions(payslip.netDeductionModule),
    ...converter.withAdditions(payslip.netAdditionModule),
    ...converter.withDeductions(payslip.taxableBenefitsModule),
  ]

  if (transactions.length > 0) {
    // Add a transaction for the net pay
    transactions.push({
      payee: config.employeePayeeName,
      amount: -payslip.takeHomePay,
      date: transactions[0]!!.date,
      is_transfer: true,
      category_id: netPayCategoryId,
      needs_review: config.transactionsNeedReview
    });
  }

  // If args include --publish, send the transactions to PocketSmith
  if (process.argv.includes('--publish')) {
    await publishTransactions(transactions, transactionAccount.id);
  } else {
    // Output the transactions in JSON format
    console.log('\nTransactions to be imported:\n');
    console.log(transactions);
    console.log('\nTransactions ready for import. Use --publish to send them to PocketSmith.');
  }
}

async function publishTransactions(transactions: pocketsmith.Transaction[], transactionAccountId: number) {
  console.log('\nPublishing transactions to PocketSmith...');
  for (const transaction of transactions) {
    console.log(`Creating transaction:`, transaction);
    await pocketsmith.createTransaction(
      transactionAccountId,
      transaction
    )
  }
  console.log('Transactions published successfully.');

}

async function readPayslipFromStdin(): Promise<zedra.InteractivePayslip> {
  const input = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', reject);
  });
  if (!input || input.length === 0) {
    throw new Error('No input received');
  }

  try {
    return JSON.parse(input.toString());
  } catch (error) {
    throw new Error(`Failed to parse payslip: ${error}`);
  }
}

run().catch((error) => {
  console.error('Error processing payslip:', error);
  process.exit(1);
});
