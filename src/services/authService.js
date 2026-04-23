function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    studentId: user.studentId,
    role: user.role
  };
}

export async function loginOrRegisterUser(db, payload) {
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const studentId = payload.studentId?.trim();
  const role = payload.role?.trim().toLowerCase();

  if (!name || !email || !studentId || !role) {
    throw createHttpError("Name, email, student ID, and role are required", 400);
  }

  if (!["student", "canteen"].includes(role)) {
    throw createHttpError("Invalid role selected", 400);
  }

  const usersCollection = db.collection("users");
  const existingUser = await usersCollection.findOne({ email, role });

  if (existingUser) {
    if (existingUser.studentId !== studentId) {
      throw createHttpError("Student ID does not match this account", 401);
    }

    if (existingUser.name !== name) {
      await usersCollection.updateOne(
        { _id: existingUser._id },
        { $set: { name, updatedAt: new Date() } }
      );
      existingUser.name = name;
    }

    return {
      message: "Login successful",
      user: sanitizeUser(existingUser)
    };
  }

  const user = {
    name,
    email,
    studentId,
    role,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await usersCollection.insertOne(user);

  return {
    message: "Account created and login successful",
    user: sanitizeUser({ ...user, _id: result.insertedId })
  };
}
