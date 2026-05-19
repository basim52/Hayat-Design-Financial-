# Security Specification for Hayat Design Dashboard

## Data Invariants
- Every document (budget, expense, revenue, waste) must have a `userId` matching the authenticated user.
- Amounts and costs must be non-negative numbers.
- `createdAt` and `updatedAt` (if applicable) must be server-timestamps.
- Category fields must match the allowed enum values.

## The "Dirty Dozen" Payloads
1. **Unauthorized Create**: Attempt to create a budget for another user's ID.
2. **Shadow Field Injection**: Adding a `isAdmin: true` field to an expense.
3. **Negative Budget**: Setting a budget amount to -100.
4. **Invalid Category**: Using "luxury" as a category name.
5. **Future Dated Budget**: (Manual check usually, but rules can enforce timestamp logic if needed).
6. **Spoofed Timestamp**: Client providing their own `createdAt` string.
7. **Orphaned Expense**: (In this case, expenses are independent, but we ensure `userId` exists).
8. **Malicious ID**: Using a very large string as a document ID.
9. **Update Hijack**: User A trying to update User B's revenue record.
10. **State Corruption**: Changing `userId` on an existing document.
11. **Type Poisoning**: Sending a string for the `amount` field.
12. **Blanket Query**: Authenticated user trying to fetch all budgets without a `where` clause (rejected by mandatory `userId` rule).

## The Test Runner (Plan)
I will implement rules that deny these. Since I don't have a local test environment for firestore rules, I will rely on the "Red Team Audit" and standard AI Studio verification.
