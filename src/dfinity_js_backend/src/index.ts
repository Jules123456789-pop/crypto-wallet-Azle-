import {
  query,
  update,
  text,
  Record,
  StableBTreeMap,
  Variant,
  Vec,
  None,
  Some,
  Ok,
  Err,
  nat64,
  Principal,
  Result,
  Canister,
} from "azle";
import { v4 as uuidv4 } from "uuid";

// Constants for business rules
const POINTS_CONVERSION_RATE = 10n; // 1 point for every 10 units
const MIN_TRANSACTION_AMOUNT = 1n;

// Enhanced User Struct with optional fields
const User = Record({
  id: text,
  first_name: text,
  last_name: text,
  username: text,
  email: text,
  phone_number: text,
  balance: nat64,
  points: nat64,
  created_at: nat64,
  updated_at: nat64,
});

// Enhanced Transaction Struct with additional fields
const Transaction = Record({
  id: text,
  from_user_id: text,
  to_user_id: text,
  amount: nat64,
  transaction_type: text, // 'TRANSFER' | 'DEPOSIT' | 'POINTS_REDEMPTION'
  status: text, // 'PENDING' | 'COMPLETED' | 'FAILED'
  points_earned: nat64,
  created_at: nat64,
});

// Improved Message Enum with specific error types
const Message = Variant({
  Success: text,
  ValidationError: text,
  NotFound: text,
  InsufficientFunds: text,
  InsufficientPoints: text,
  DuplicateEmail: text,
  SystemError: text,
});

// Improved Payloads with validation
const UserPayload = Record({
  first_name: text,
  last_name: text,
  email: text,
  phone_number: text,
});

const TransactionPayload = Record({
  from_user_id: text,
  to_user_id: text,
  amount: nat64,
});

const PointsPayload = Record({
  user_id: text,
  points: nat64,
});

const DepositPayload = Record({
  user_id: text,
  amount: nat64,
});

// Storage with improved naming
const userStorage = StableBTreeMap(0, text, User);
const transactionStorage = StableBTreeMap(1, text, Transaction); // Changed index to 1

// Validation helper functions
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

function getCurrentTimestamp(): nat64 {
  return BigInt(Math.floor(Date.now() / 1000));
}

function generateUsername(firstName: string, lastName: string): string {
  const sanitizedFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sanitizedLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${sanitizedFirst}${sanitizedLast.substring(0, 10)}${Math.floor(Math.random() * 1000)}`;
}

export default Canister({
  // Improved create_user with better validation and error handling
  create_user: update([UserPayload], Result(User, Message), (payload) => {
    // Input validation
    if (!payload.first_name?.trim() || !payload.last_name?.trim()) {
      return Err({ ValidationError: "First name and last name are required." });
    }

    if (!validateEmail(payload.email)) {
      return Err({ ValidationError: "Invalid email address format." });
    }

    if (!validatePhoneNumber(payload.phone_number)) {
      return Err({ ValidationError: "Invalid phone number format." });
    }

    // Check email uniqueness
    const existingUser = userStorage.values().find(user => user.email === payload.email);
    if (existingUser) {
      return Err({ DuplicateEmail: "Email already exists." });
    }

    const timestamp = getCurrentTimestamp();
    const user = {
      id: uuidv4(),
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      username: generateUsername(payload.first_name, payload.last_name),
      email: payload.email.toLowerCase(),
      phone_number: payload.phone_number,
      balance: 0n,
      points: 0n,
      created_at: timestamp,
      updated_at: timestamp,
    };

    userStorage.insert(user.id, user);
    return Ok(user);
  }),

  // Improved deposit_funds with transaction tracking
  deposit_funds: update([DepositPayload], Result(Transaction, Message), (payload) => {
    if (payload.amount < MIN_TRANSACTION_AMOUNT) {
      return Err({ ValidationError: "Amount must be greater than 0." });
    }

    const userOpt = userStorage.get(payload.user_id);
    if ("None" in userOpt) {
      return Err({ NotFound: `User with id ${payload.user_id} not found.` });
    }

    const user = userOpt.Some;
    const timestamp = getCurrentTimestamp();

    // Create deposit transaction
    const transaction = {
      id: uuidv4(),
      from_user_id: "SYSTEM",
      to_user_id: payload.user_id,
      amount: payload.amount,
      transaction_type: "DEPOSIT",
      status: "COMPLETED",
      points_earned: 0n,
      created_at: timestamp,
    };

    // Update user balance
    user.balance += payload.amount;
    user.updated_at = timestamp;

    userStorage.insert(user.id, user);
    transactionStorage.insert(transaction.id, transaction);

    return Ok(transaction);
  }),

  // Improved send_transaction with atomic operations
  send_transaction: update([TransactionPayload], Result(Transaction, Message), (payload) => {
    if (payload.amount < MIN_TRANSACTION_AMOUNT) {
      return Err({ ValidationError: "Amount must be greater than 0." });
    }

    const fromUserOpt = userStorage.get(payload.from_user_id);
    const toUserOpt = userStorage.get(payload.to_user_id);

    if ("None" in fromUserOpt) {
      return Err({ NotFound: "Sender not found." });
    }

    if ("None" in toUserOpt) {
      return Err({ NotFound: "Recipient not found." });
    }

    let fromUser = fromUserOpt.Some;
    let toUser = toUserOpt.Some;

    if (fromUser.balance < payload.amount) {
      return Err({ InsufficientFunds: "Insufficient balance." });
    }

    const timestamp = getCurrentTimestamp();
    const pointsEarned = payload.amount / POINTS_CONVERSION_RATE;

    const transaction = {
      id: uuidv4(),
      from_user_id: payload.from_user_id,
      to_user_id: payload.to_user_id,
      amount: payload.amount,
      transaction_type: "TRANSFER",
      status: "COMPLETED",
      points_earned: pointsEarned,
      created_at: timestamp,
    };

    // Update balances and points atomically
    fromUser.balance -= payload.amount;
    fromUser.points += pointsEarned;
    fromUser.updated_at = timestamp;

    toUser.balance += payload.amount;
    toUser.updated_at = timestamp;

    // Commit all changes
    userStorage.insert(fromUser.id, fromUser);
    userStorage.insert(toUser.id, toUser);
    transactionStorage.insert(transaction.id, transaction);

    return Ok(transaction);
  }),

  // Improved redeem_points with transaction tracking
  redeem_points: update([PointsPayload], Result(Transaction, Message), (payload) => {
    if (payload.points === 0n) {
      return Err({ ValidationError: "Points must be greater than 0." });
    }

    const userOpt = userStorage.get(payload.user_id);
    if ("None" in userOpt) {
      return Err({ NotFound: "User not found." });
    }

    let user = userOpt.Some;
    if (user.points < payload.points) {
      return Err({ InsufficientPoints: "Insufficient points balance." });
    }

    const timestamp = getCurrentTimestamp();
    
    const transaction = {
      id: uuidv4(),
      from_user_id: payload.user_id,
      to_user_id: "SYSTEM",
      amount: 0n,
      transaction_type: "POINTS_REDEMPTION",
      status: "COMPLETED",
      points_earned: -payload.points, // Negative to indicate points spent
      created_at: timestamp,
    };

    user.points -= payload.points;
    user.updated_at = timestamp;

    userStorage.insert(user.id, user);
    transactionStorage.insert(transaction.id, transaction);

    return Ok(transaction);
  }),

  // Improved query functions with pagination
  get_transaction_history: query(
    [text, nat64, nat64], // user_id, skip, limit
    Result(Vec(Transaction), Message),
    (user_id, skip, limit) => {
      const transactions = transactionStorage
        .values()
        .filter(
          (tx) =>
            tx.from_user_id === user_id ||
            tx.to_user_id === user_id
        )
        .sort((a, b) => Number(b.created_at - a.created_at)) // Sort by newest first
        .slice(Number(skip), Number(skip + limit));

      if (transactions.length === 0) {
        return Err({ NotFound: "No transactions found." });
      }

      return Ok(transactions);
    }
  ),

  get_user_balance: query([text], Result(nat64, Message), (user_id) => {
    const userOpt = userStorage.get(user_id);
    if ("None" in userOpt) {
      return Err({ NotFound: "User not found." });
    }
    return Ok(userOpt.Some.balance);
  }),

  get_user_points: query([text], Result(nat64, Message), (user_id) => {
    const userOpt = userStorage.get(user_id);
    if ("None" in userOpt) {
      return Err({ NotFound: "User not found." });
    }
    return Ok(userOpt.Some.points);
  }),

  // New helper function to get user details
  get_user: query([text], Result(User, Message), (user_id) => {
    const userOpt = userStorage.get(user_id);
    if ("None" in userOpt) {
      return Err({ NotFound: "User not found." });
    }
    return Ok(userOpt.Some);
  }),
});