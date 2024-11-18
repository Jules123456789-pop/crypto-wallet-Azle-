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

 // a new Record type for the transaction response
 const TransactionResponse = Record({
  transaction: Transaction,
  new_balance: nat64,
  points_earned: nat64,
  message: text
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
const transactionsStorage = StableBTreeMap(2, text, Transaction);

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
      return Err({
        InvalidPayload:
          "Ensure 'first_name', 'last_name', 'email', and 'phone_number' are provided.",
      });
    }

    // Validate email and phone number using regex
    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email_regex.test(payload.email)) {
      return Err({
        InvalidPayload: "Invalid email address format.",
      });
    }

    const phone_regex = /^\+?[1-9]\d{1,14}$/;
    if (!phone_regex.test(payload.phone_number)) {
      return Err({
        InvalidPayload: "Invalid phone number format.",
      });
    }

    // Ensure email uniqueness
    const is_email_unique = usersStorage
      .values()
      .every((user) => user.email !== payload.email);

    if (!is_email_unique) {
      return Err({ InvalidPayload: "Email already exists." });
    }

    const id = uuidv4(); // Generate a unique ID

    // Create a username using the first name and last name
    const username = `${payload.first_name.toLowerCase()}${payload.last_name
      .toLowerCase()
      .substring(0, 10)}`;

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

    usersStorage.insert(id, user);
    return Ok(user);
  }),

  // Function to fetc all users
  fetch_all_users: query([], Result(Vec(User), Message), () => {
    const users = usersStorage.values();

    if (users.length === 0) {
      return Err({ NotFound: "No users found." });
    }

    return Ok(users);
  }),

  // Deposit Funds Function
  deposit_funds: update(
    [DepositPayload],
    Result(Message, Message),
    (payload) => {
      if (payload.amount === 0n) {
        return Err({ InvalidPayload: "Amount must be greater than 0." });
      }

      const userOpt = usersStorage.get(payload.user_id);
      if ("None" in userOpt) {
        return Err({ NotFound: `User with id ${payload.user_id} not found.` });
      }

      const user = userOpt.Some;
      user.balance += payload.amount;

      const newBlance = user.balance;


      usersStorage.insert(payload.user_id, user);

      return Ok({
        Success: `Deposited ${payload.amount} units of currency to user ${payload.user_id} new balance is ${newBlance}`,
      });
    }
  ),



// Then modify the send_transaction function
send_transaction: update(
  [TransactionPayload],
  Result(TransactionResponse, Message),
  (payload) => {
      if (payload.amount === 0n) {
          return Err({
              InvalidPayload: "Amount must be greater than 0.",
          });
      }

      const fromUserOpt = usersStorage.get(payload.from_user_id);
      const toUserOpt = usersStorage.get(payload.to_user_id);

      if ("None" in fromUserOpt) {
          return Err({ NotFound: "Sender not found." });
      }

      if ("None" in toUserOpt) {
          return Err({ NotFound: "Recipient not found." });
      }

      // Ensure sender and recipient are not the same
      if (payload.from_user_id === payload.to_user_id) {
          return Err({
              InvalidPayload: "Sender and recipient cannot be the same.",
          });
      }

      let from_user = fromUserOpt.Some;
      let to_user = toUserOpt.Some;

      // Ensure sender has sufficient balance
      if (from_user.balance < payload.amount) {
          return Err({ Error: "Insufficient balance." });
      }

      // Process the transaction
      from_user.balance -= payload.amount;
      to_user.balance += payload.amount;

      // Calculate points
      const points = payload.amount / 10n; // Award 1 point for every 10 units of currency
      from_user.points += points;

      // Update storage
      usersStorage.insert(from_user.id, from_user);
      usersStorage.insert(to_user.id, to_user);

      // Create and store transaction record
      const id = uuidv4();
      const transaction = {
          id,
          from_user_id: payload.from_user_id,
          to_user_id: payload.to_user_id,
          amount: payload.amount,
          created_at: current_time().toString(),
      };

      transactionsStorage.insert(id, transaction);

      // Return comprehensive response
      return Ok({
          transaction: transaction,
          new_balance: from_user.balance,
          points_earned: points,
          message: `Successfully transferred ${payload.amount.toString()} units. 
                   New balance: ${from_user.balance.toString()} units. 
                   Points earned: ${points.toString()}`
      });
  }
),

  // Redeem Points Function
  redeem_points: update(
    [PointsPayload],
    Result(Message, Message),
    (payload) => {
      const userOpt = usersStorage.get(payload.user_id);

      if ("None" in userOpt) {
        return Err({ NotFound: "User not found." });
      }

      let user = userOpt.Some;

      if (user.points >= payload.points) {
        user.points -= payload.points;

        const newPointsBalance = user.points;

        usersStorage.insert(payload.user_id, user);
        return Ok({
          Success: `Redeemed ${payload.points} points from user ${payload.user_id} new points balance is ${newPointsBalance}`,
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
  get_user_balance: query([text], Result(Message, Message), (user_id) => {
    const userOpt = usersStorage.get(user_id);

    if ("None" in userOpt) {
      return Err({ NotFound: "User not found." });
    }

    return Ok({
      Success: `User balance is: ${userOpt.Some.balance.toString()} units`,
    });
  }),

  // Function to get total user points
  get_user_points: query([text], Result(Message, Message), (user_id) => {
    const userOpt = usersStorage.get(user_id);

    if ("None" in userOpt) {
      return Err({ NotFound: "User not found." });
    }

    return Ok({
      Success: `User points are: ${userOpt.Some.points.toString()}`,
    });
  }),
});
