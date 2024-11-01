import {
  query,
  update,
  text,
  Null,
  Record,
  StableBTreeMap,
  Variant,
  Vec,
  None,
  Some,
  Ok,
  Err,
  ic,
  Principal,
  Opt,
  Result,
  nat64,
  bool,
  Canister,
} from "azle";
import { v4 as uuidv4 } from "uuid";

// User Struct
const User = Record({
  id: text,
  first_name: text,
  last_name: text,
  username: text,
  email: text,
  phone_number: text,
  balance: nat64,
  points: nat64,
  created_at: text,
});

// Transaction Struct
const Transaction = Record({
  id: text,
  from_user_id: text,
  to_user_id: text,
  amount: nat64,
  created_at: text,
});

// Message Enum for Error and Success Handling
const Message = Variant({
  Success: text,
  Error: text,
  NotFound: text,
  InvalidPayload: text,
  Unauthorized: text,
});

// User Payload
const UserPayload = Record({
  first_name: text,
  last_name: text,
  email: text,
  phone_number: text,
});

// Transaction Payload
const TransactionPayload = Record({
  from_user_id: text,
  to_user_id: text,
  amount: nat64,
});

// Points Payload
const PointsPayload = Record({
  user_id: text,
  points: nat64,
});

// Deposit Payload
const DepositPayload = Record({
  user_id: text,
  amount: nat64,
});

// Storage initialization
const usersStorage = StableBTreeMap(0, text, User);
const transactionsStorage = StableBTreeMap(0, text, Transaction);

// Helper Function for Current Time in ISO 8601 Format
function current_time(): string {
  return new Date().toISOString();
}

// Extracted Helper Function for User Lookup
function get_user(user_id: text): Result(User, Message) {
  const userOpt = usersStorage.get(user_id);
  if ("None" in userOpt) {
    return Err({ NotFound: "User not found." });
  }
  return Ok(userOpt.Some);
}

// Create User Function
export default Canister({
  create_user: update([UserPayload], Result(User, Message), (payload) => {
    if (
      !payload.first_name ||
      !payload.last_name ||
      !payload.email ||
      !payload.phone_number
    ) {
      return Err({
        InvalidPayload: "Ensure 'first_name', 'last_name', 'email', and 'phone_number' are provided.",
      });
    }

    // Validate email and phone number using regex
    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email_regex.test(payload.email)) {
      return Err({ InvalidPayload: "Invalid email address format." });
    }

    const phone_regex = /^\+?[1-9]\d{1,14}$/;
    if (!phone_regex.test(payload.phone_number)) {
      return Err({ InvalidPayload: "Invalid phone number format." });
    }

    // Ensure username uniqueness
    const username = `${payload.first_name.toLowerCase()}${payload.last_name
      .toLowerCase()
      .substring(0, 10)}`;
    const is_username_unique = usersStorage
      .values()
      .every((user) => user.username !== username);

    if (!is_username_unique) {
      return Err({ InvalidPayload: "Username already exists." });
    }

    const id = uuidv4(); // Generate a unique ID

    const user = {
      id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      username,
      email: payload.email,
      phone_number: payload.phone_number,
      created_at: current_time(),
      balance: 0n, // Initialize balance
      points: 0n, // Initialize points
    };

    usersStorage.insert(id, user);
    return Ok(user);
  }),

  // Deposit Funds Function
  deposit_funds: update(
    [DepositPayload],
    Result(Message, Message),
    (payload) => {
      if (payload.amount <= 0n) {
        return Err({ InvalidPayload: "Amount must be greater than 0." });
      }

      const userResult = get_user(payload.user_id);
      if ("Err" in userResult) {
        return userResult; // Return error if user not found
      }

      const user = userResult.Ok;
      user.balance += payload.amount;
      usersStorage.insert(payload.user_id, user);

      return Ok({
        Success: `Deposited ${payload.amount} units of currency to user ${payload.user_id}`,
      });
    }
  ),

  // Send Transaction Function
  send_transaction: update(
    [TransactionPayload],
    Result(Transaction, Message),
    (payload) => {
      if (payload.amount <= 0n) {
        return Err({ InvalidPayload: "Amount must be greater than 0." });
      }

      const from_user_result = get_user(payload.from_user_id);
      const to_user_result = get_user(payload.to_user_id);

      if ("Err" in from_user_result) {
        return from_user_result; // Return error if sender not found
      }

      if ("Err" in to_user_result) {
        return to_user_result; // Return error if recipient not found
      }

      const from_user = from_user_result.Ok;
      const to_user = to_user_result.Ok;

      if (from_user.balance < payload.amount) {
        return Err({ Error: "Insufficient balance." });
      }

      from_user.balance -= payload.amount;
      to_user.balance += payload.amount;

      usersStorage.insert(from_user.id, from_user);
      usersStorage.insert(to_user.id, to_user);

      const id = uuidv4();
      const transaction = {
        id,
        from_user_id: payload.from_user_id,
        to_user_id: payload.to_user_id,
        amount: payload.amount,
        created_at: current_time(),
      };

      transactionsStorage.insert(id, transaction);

      // Award points for the transaction
      const points = payload.amount / 10n; // Award 1 point for every 10 units of currency
      from_user.points += points;
      usersStorage.insert(from_user.id, from_user);

      return Ok(transaction);
    }
  ),

  // Redeem Points Function
  redeem_points: update(
    [PointsPayload],
    Result(Message, Message),
    (payload) => {
      const userResult = get_user(payload.user_id);

      if ("Err" in userResult) {
        return userResult; // Return error if user not found
      }

      let user = userResult.Ok;

      if (user.points >= payload.points) {
        user.points -= payload.points;
        usersStorage.insert(payload.user_id, user);
        return Ok({
          Success: `Redeemed ${payload.points} points from user ${payload.user_id}`,
        });
      } else {
        return Err({ Error: "Insufficient points." });
      }
    }
  ),

  // Get Transaction History
  get_transaction_history: query(
    [text],
    Result(Vec(Transaction), Message),
    (user_id) => {
      const transactions = transactionsStorage
        .values()
        .filter(
          (transaction) =>
            transaction.from_user_id === user_id ||
            transaction.to_user_id === user_id
        );

      if (transactions.length === 0) {
        return Err({ NotFound: "No transactions found." });
      }

      return Ok(transactions);
    }
  ),

  // Get User Balance
  get_user_balance: query([text], Result(nat64, Message), (user_id) => {
    const userResult = get_user(user_id);
    if ("Err" in userResult) {
      return userResult; // Return error if user not found
    }
    return Ok(userResult.Ok.balance);
  }),

  // Get User Points
  get_user_points: query([text], Result(nat64, Message), (user_id) => {
    const userResult = get_user(user_id);
    if ("Err" in userResult) {
      return userResult; // Return error if user not found
    }
    return Ok(userResult.Ok.points);
  }),
});
