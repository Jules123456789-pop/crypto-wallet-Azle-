
# Crypto-Wallet

A decentralized user management system with transaction and point tracking capabilities using Azle and Internet Computer Protocol (ICP).

## Overview

Crypto-Wallet is a decentralized platform where users can register, deposit funds, make transactions, and redeem points. The platform utilizes Internet Computer (ICP) and Azle to manage users, transactions, and points in a secure and scalable manner, providing a decentralized approach to wallet and transaction management.

## Features

- **User Registration:** Allows users to create accounts with personal details such as first name, last name, email, and phone number. A unique username is generated automatically.
- **Fund Deposit:** Users can deposit funds into their accounts and manage their balances.
- **Transactions:** Users can send funds to other users, with transaction history stored in a decentralized manner.
- **Points System:** Points are awarded based on transaction amounts, and users can redeem accumulated points for rewards.
- **Transaction History:** Users can view a history of their transactions.
- **Balance Inquiry:** Users can check their account balances.
- **Points Inquiry:** Users can check their accumulated points balance.

## Data Structures

### User

- `id`: Unique identifier for the user.
- `first_name`: User's first name.
- `last_name`: User's last name.
- `username`: Automatically generated username based on the first and last names.
- `email`: User's email address.
- `phone_number`: User's phone number.
- `balance`: User's account balance in units of currency.
- `points`: User's accumulated points.
- `created_at`: Timestamp indicating when the user was created.

### Transaction

- `id`: Unique identifier for the transaction.
- `from_user_id`: ID of the sender.
- `to_user_id`: ID of the recipient.
- `amount`: Amount of funds transferred.
- `created_at`: Timestamp of when the transaction was created.

### Message Enum

Enum used for error and success handling in the smart contract functions. Variants include:
- `Success`: Operation succeeded.
- `Error`: An error occurred.
- `NotFound`: Entity (user or transaction) not found.
- `InvalidPayload`: Payload data is invalid.
- `Unauthorized`: Action not authorized.

### Payloads

#### UserPayload
- `first_name`: First name of the user.
- `last_name`: Last name of the user.
- `email`: Email address of the user.
- `phone_number`: Phone number of the user.

#### TransactionPayload
- `from_user_id`: ID of the sender.
- `to_user_id`: ID of the recipient.
- `amount`: Amount to be transferred.

#### PointsPayload
- `user_id`: ID of the user redeeming points.
- `points`: Number of points to redeem.

#### DepositPayload
- `user_id`: ID of the user making the deposit.
- `amount`: Amount to be deposited.

## Storage

- `usersStorage`: A `StableBTreeMap` that stores user information.
- `transactionsStorage`: A `StableBTreeMap` that stores transaction details.

## Functions

### `create_user(UserPayload)`

- Registers a new user with their first name, last name, email, and phone number.
- Returns the created user details or an error message if the data is invalid.

### `deposit_funds(DepositPayload)`

- Deposits funds into the user’s account.
- Ensures the amount is greater than zero and that the user exists.

### `send_transaction(TransactionPayload)`

- Transfers funds from one user to another.
- Ensures the sender has sufficient funds and awards points based on the transaction amount.

### `redeem_points(PointsPayload)`

- Allows users to redeem points accumulated through transactions.
- Ensures the user has enough points to redeem.

### `get_transaction_history(user_id: nat64)`

- Retrieves the transaction history for a specific user.
- Returns an array of transactions where the user is either the sender or recipient.

### `get_user_balance(user_id: nat64)`

- Returns the account balance of a user.

### `get_user_points(user_id: nat64)`

- Returns the accumulated points of a user.

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/Jules123456789-pop/crypto-wallet-Azle-.git
   cd crypto-wallet-Azle-
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the local replica:

   ```bash
   dfx start --background --clean

4. Deploy the canister to the Internet Computer:

   ```bash
   dfx deploy


## Things to be explained in the course:
1. What is Ledger? More details here: https://internetcomputer.org/docs/current/developer-docs/integrations/ledger/
2. What is Internet Identity? More details here: https://internetcomputer.org/internet-identity
3. What is Principal, Identity, Address? https://internetcomputer.org/internet-identity | https://yumimarketplace.medium.com/whats-the-difference-between-principal-id-and-account-id-3c908afdc1f9
4. Canister-to-canister communication and how multi-canister development is done? https://medium.com/icp-league/explore-backend-multi-canister-development-on-ic-680064b06320


## License

This project is licensed under the MIT License. See the `LICENSE` file for more information.

---

Happy coding with Crypto-Wallet! 🎉
