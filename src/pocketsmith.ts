export type Transaction = {
  payee: string;
  amount: number;
  date: string;
  is_transfer: boolean;
  category_id: number;
  needs_review: boolean;
}

export type User = {
  id: number;
}

export type TransactionAccount = {
  id: number;
  name: string;
}

export type Category = {
  id: number;
  title: string;
  children: Category[];
}

import { pocketsmithDeveloperKey } from '../config.json';

async function makeRequest(path: string, method: 'GET' | 'POST', body?: any): Promise<any> {
  const url = 'https://api.pocketsmith.com/v2' + path;
  console.log(`Making request to ${method} ${url}`);
  const response = await fetch(
    url,
    {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Developer-Key': pocketsmithDeveloperKey,
      },
      body: body ? JSON.stringify(body) : null,
    }
  )

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}, body: ${await response.text()}`);
  }

  return response.json();
}

async function getAuthorisedUser(): Promise<User> {
  return await makeRequest('/me', 'GET');
}

async function listTransactionAccounts(userId: number): Promise<TransactionAccount[]> {
  return await makeRequest(`/users/${userId}/transaction_accounts`, 'GET');
}

async function listCategories(userId: number): Promise<Category[]> {
  return flattenCategories(await makeRequest(`/users/${userId}/categories`, 'GET'));
}

function flattenCategories(categories: Category[]): Category[] {
  const flatCategories: Category[] = [];
  for (const category of categories) {
    flatCategories.push({ ...category, children: [] });
    if (category.children && category.children.length > 0) {
      flatCategories.push(...flattenCategories(category.children));
    }
  }
  return flatCategories;
}

async function createTransaction(transactionAccountId: number, transaction: Transaction) {
  await makeRequest(`/transaction_accounts/${transactionAccountId}/transactions`, 'POST', transaction)
}

export { getAuthorisedUser, listTransactionAccounts, listCategories, createTransaction };
