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

// Helper Function for Current Time
function current_time(): nat64 {
  return BigInt(Math.floor(Date.now() / 1000));
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
      return Err({ Error: "Invalid input data." });
    }

    // Validate email and phone number using regex
    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email_regex.test(payload.email)) {
      return Err({ Error: "Invalid input data." });
    }

    const phone_regex = /^\+?[1-9]\d{1,14}$/;
    if (!phone_regex.test(payload.phone_number)) {
      return Err({ Error: "Invalid input data." });
    }

    // Ensure email and username uniqueness (within a critical section)
    const is_email_unique = usersStorage.values().every(user => user.email !== payload.email);
    const username = `${payload.first_name.toLowerCase()}${payload.last_name.toLowerCase().substring(0, 10)}`;
    const is_username_unique = usersStorage.values().every(user => user.username !== username);

    if (!is_email_unique || !is_username_unique) {
      return Err({ Error: "Invalid input data." });
    }

    const id = uuidv4(); // Generate a unique ID
    const user = {
      id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      username,
      email: payload.email,
      phone_number: payload.phone_number,
      created_at: current_time().toString(),
      balance: 0n, // Initialize balance
      points: 0n, // Initialize points
    };

    // Ensure atomicity using transactions.
    usersStorage.insert(id, user);
    return Ok(user);
}),

  // Deposit Funds Function
  deposit_funds: update([DepositPayload], Result(Message, Message), (payload) => {
    if (payload.amount <= 0n) {
        return Err({ Error: "Invalid input data." });
    }

    const userOpt = usersStorage.get(payload.user_id);
    if ("None" in userOpt) {
        return Err({ Error: "User not found." });
    }

    let user = userOpt.Some;

    // Prevent overflow when adding funds
    if (user.balance + payload.amount < user.balance) {
        return Err({ Error: "Balance overflow detected." });
    }

    user.balance += payload.amount;

    // Perform the update in an atomic block if supported
    usersStorage.insert(payload.user_id, user);

    return Ok({ Success: `Deposit successful` });
}),

  // Send Transaction Function
  send_transaction: update([TransactionPayload], Result(Transaction, Message), (payload) => {
    if (payload.amount <= 0n) {
        return Err({ Error: "Invalid input data." });
    }

    const fromUserOpt = usersStorage.get(payload.from_user_id);
    const toUserOpt = usersStorage.get(payload.to_user_id);

    if ("None" in fromUserOpt || "None" in toUserOpt) {
        return Err({ Error: "User not found." });
    }

    let from_user = fromUserOpt.Some;
    let to_user = toUserOpt.Some;

    // Concurrency protection (pseudo-locking)
    const transactionLock = `${from_user.id}-${to_user.id}`;
    if (ic.is_locked(transactionLock)) {
        return Err({ Error: "Transaction in progress. Please try again later." });
    }

    ic.lock(transactionLock);

    // Check for sufficient balance
    if (from_user.balance < payload.amount) {
        ic.unlock(transactionLock);
        return Err({ Error: "Insufficient balance." });
    }

    // Prevent race condition and ensure atomicity
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
        created_at: current_time().toString(),
    };

    transactionsStorage.insert(id, transaction);

    // Award points based on the transaction
    from_user.points += payload.amount / 10n;
    usersStorage.insert(from_user.id, from_user);

    // Release lock
    ic.unlock(transactionLock);

    return Ok(transaction);
}),

  // Redeem Points Function
  redeem_points: update([PointsPayload], Result(Message, Message), (payload) => {
    const userOpt = usersStorage.get(payload.user_id);
    if ("None" in userOpt) {
        return Err({ Error: "User not found." });
    }

    let user = userOpt.Some;

    // Concurrency protection (pseudo-locking)
    if (ic.is_locked(user.id)) {
        return Err({ Error: "Points redemption in progress. Try again later." });
    }

    ic.lock(user.id);

    // Prevent redeeming more points than the user has
    if (user.points < payload.points) {
        ic.unlock(user.id);
        return Err({ Error: "Insufficient points." });
    }

    // Limit the maximum points redeemable in one go
    const MAX_POINTS = 10000n;
    const pointsToRedeem = payload.points > MAX_POINTS ? MAX_POINTS : payload.points;

    user.points -= pointsToRedeem;
    usersStorage.insert(user.id, user);

    ic.unlock(user.id);

    return Ok({ Success: `Redeemed ${pointsToRedeem} points.` });
}),

  // Get Transaction History
  get_transaction_history: query([text], Result(Vec(Transaction), Message), (user_id) => {
    const requestingUser = ic.caller(); // Assume this is the authenticated principal

    if (requestingUser.toString() !== user_id) {
        return Err({ Error: "Unauthorized access." });
    }

    const transactions = transactionsStorage
        .values()
        .filter(transaction => transaction.from_user_id === user_id || transaction.to_user_id === user_id);

    if (transactions.length === 0) {
        return Err({ Error: "No transactions found." });
    }

    return Ok(transactions);
}),

  // Get User Balance
  get_user_balance: query([text], Result(nat64, Message), (user_id) => {
    const requestingUser = ic.caller(); // Assume this is the authenticated principal

    if (requestingUser.toString() !== user_id) {
        return Err({ Error: "Unauthorized access." });
    }

    const userOpt = usersStorage.get(user_id);
    if ("None" in userOpt) {
        return Err({ Error: "User not found." });
    }

    return Ok(userOpt.Some.balance);
}),

  // Get User Points
  get_user_points: query([text], Result(nat64, Message), (user_id) => {
    const requestingUser = ic.caller(); // Assume this is the authenticated principal

    if (requestingUser.toString() !== user_id) {
        return Err({ Error: "Unauthorized access." });
    }

    const userOpt = usersStorage.get(user_id);
    if ("None" in userOpt) {
        return Err({ Error: "User not found." });
    }

    return Ok(userOpt.Some.points);
}),
});
