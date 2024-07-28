const express = require("express");
const cors = require("cors");
const passwordValidationHandler = require("./util/passwordValidationHandler");
const { app: firebaseApp, database: db } = require("./config/firebaseConfig");
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
} = require("firebase/auth");
const {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  where,
  query,
  getDocs,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
} = require("firebase/firestore");
const authenticate = require("./middlewares/firebaseAuthMiddleware"); // Import authentication middleware

const usersCollection = collection(db, "users");
const postsCollection = collection(db, "posts");

const app = express();
const PORT = process.env.PORT || 5000;

// Use JSON parsing middleware globally
app.use(express.json());
app.use(cors()); // Enable CORS for all routes(not safe but it is what it is)

const auth = getAuth(); // firebase authentication instance

// Route to handle login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  console.log("Someone tried to login with the email: " + email);

  const passwordValid = passwordValidationHandler.passwordValidation(password);
  if (!passwordValid) {
    return res.status(400).json({
      error:
        "Error: The string must be at least 8 characters long, contain at least one uppercase letter, and include at least one symbol",
    });
  }

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      console.log(`User UID: ${user.uid}`);

      // Get the ID token
      return user.getIdToken().then((idToken) => {
        // Create a query to find the user by UID
        const userQuery = query(usersCollection, where("uid", "==", user.uid));
        // Execute the query
        return getDocs(userQuery).then((snapshot) => {
          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            return res.json({
              message: "Login successful",
              user: userData,
              idToken: idToken,
            });
          } else {
            // No matching document found
            return res.status(404).json({
              error: "Error: User details not found in the database.",
            });
          }
        });
      });
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      // Handle errors during Firestore query and sign-in
      return res.status(500).json({
        error: `Unexpected error: ${err.message}`,
      });
    });
});

// Route to handle registration
app.post("/register", (req, res) => {
  const { email, password, firstName } = req.body;
  console.log("Someone tried to register with the email: " + email);

  const passwordValid = passwordValidationHandler.passwordValidation(password);
  if (!passwordValid) {
    return res.status(400).json({
      error:
        "Error: The string must be at least 8 characters long, contain at least one uppercase letter, and include at least one symbol",
    });
  }

  if (!firstName) {
    return res.status(400).json({
      error: "Error: First name is required.",
    });
  }

  let createdUser;

  createUserWithEmailAndPassword(auth, email, password)
    .then((response) => {
      createdUser = response.user; // Save the user object for later use
      console.log(`User created with UID: ${createdUser.uid}`);
      // Use setDoc to set the document ID to UID
      const userDoc = doc(db, "users", createdUser.uid);
      return setDoc(userDoc, {
        uid: createdUser.uid,
        email: email,
        firstName: firstName,
        following: [],
        followers: [],
      });
    })
    .then(() => {
      // Get the ID token after creating the user
      return createdUser.getIdToken().then((idToken) => {
        // Respond with success message and ID token
        return res.json({
          message: "Registration successful!",
          user: {
            uid: createdUser.uid,
            email: email,
            firstName: firstName,
            following: [],
            followers: [],
          },
          idToken: idToken,
        });
      });
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      if (createdUser) {
        // If user creation succeeded but document creation failed, delete the user
        deleteUser(createdUser)
          .then(() => {
            console.log("Error: Unexpected error creating database document.");
            return res.status(400).json({ error: `Error: ${err.message}` });
          })
          .catch((deleteErr) => {
            console.error(`Error deleting user: ${deleteErr.message}`);
            return res
              .status(500)
              .json({ error: `Error deleting user: ${deleteErr.message}` });
          });
      } else {
        // Handle errors where user creation itself failed
        return res.status(400).json({ error: `Error: ${err.message}` });
      }
    });
});

// Route to create a post
app.post("/create-post", authenticate, async (req, res) => {
  const { uid } = req.user; // Get UID from the token
  const { title, body, author } = req.body;
  console.log(author);
  const authorObj = JSON.parse(author);
  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required" });
  }

  try {
    const postDoc = doc(postsCollection, `${uid}_${Date.now()}`); // Use UID and timestamp to create a unique document
    await setDoc(postDoc, {
      title: title,
      body: body,
      author: authorObj.firstName,
      createdAt: Timestamp.fromDate(new Date()), // Use Firestore timestamp
      uid: uid,
      comments: [],
    });
    res.json({ message: "Post created successfully" });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Error creating post" });
  }
});

// Route to get posts
app.get("/posts", async (req, res) => {
  const { lastVisible } = req.query;

  let queryRef = query(postsCollection, orderBy("createdAt", "desc"), limit(5));

  if (lastVisible) {
    const lastVisibleDate = new Date(lastVisible);
    const lastVisibleTimestamp = Timestamp.fromDate(lastVisibleDate);
    queryRef = query(
      postsCollection,
      orderBy("createdAt", "desc"),
      startAfter(lastVisibleTimestamp),
      limit(5)
    );
  }

  try {
    const snapshot = await getDocs(queryRef);
    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const lastPost = snapshot.docs[snapshot.docs.length - 1];
    res.json({
      posts: posts,
      lastVisible: lastPost
        ? lastPost.data().createdAt.toDate().toISOString()
        : null,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Error fetching posts" });
  }
});

// Route to edit a post
app.put("/edit-post/:postId", authenticate, async (req, res) => {
  const { postId } = req.params;
  const { title, body } = req.body;
  const { uid } = req.user;

  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required" });
  }

  try {
    const postDocRef = doc(postsCollection, postId);
    const postDoc = await getDoc(postDocRef);

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postDoc.data();
    const userDocRef = doc(usersCollection, uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userDoc.data();

    if (post.uid !== uid && !user.isAdmin) {
      return res.status(403).json({
        error: "You can only edit your own posts or you need admin rights",
      });
    }

    await updateDoc(postDocRef, {
      title,
      body,
    });

    const updatedPost = (await getDoc(postDocRef)).data();

    res.json({
      message: "Post updated successfully",
      updatedPost: { ...updatedPost, id: postDocRef.id },
    });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({ error: "Error updating post" });
  }
});
// Route to delete a post
app.delete("/delete-post/:postId", authenticate, async (req, res) => {
  const { postId } = req.params;
  const { uid } = req.user;

  try {
    const postDocRef = doc(postsCollection, postId);
    const postDoc = await getDoc(postDocRef);

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postDoc.data();
    const userDocRef = doc(usersCollection, uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userDoc.data();

    if (post.uid !== uid && !user.isAdmin) {
      return res.status(403).json({
        error: "You can only delete your own posts or you need admin rights",
      });
    }

    await deleteDoc(postDocRef);

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Error deleting post" });
  }
});
// Route to like or dislike a post
app.post("/toggle-like/:postId", authenticate, async (req, res) => {
  const { postId } = req.params;
  const { uid } = req.user;

  try {
    const postDocRef = doc(postsCollection, postId);
    const userDocRef = doc(usersCollection, uid);
    const postDoc = await getDoc(postDocRef);

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postDoc.data();
    const userLiked = post.likes && post.likes.includes(uid);

    const postUpdate = userLiked
      ? { likes: arrayRemove(uid), likeCount: increment(-1) }
      : { likes: arrayUnion(uid), likeCount: increment(1) };

    const userUpdate = userLiked
      ? { likedPosts: arrayRemove(postId) }
      : { likedPosts: arrayUnion(postId) };

    await updateDoc(postDocRef, postUpdate);
    await updateDoc(userDocRef, userUpdate);

    res.json({
      message: `Post ${userLiked ? "disliked" : "liked"} successfully`,
      postId,
      userLiked,
    });
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ error: "Error toggling like" });
  }
});

// Route to get the names of users who liked a post
app.get("/post-likes/:postId", async (req, res) => {
  const { postId } = req.params;

  try {
    const postDocRef = doc(postsCollection, postId);
    const postDoc = await getDoc(postDocRef);

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postDoc.data();

    if (!post.likes || post.likes.length === 0) {
      return res.json({ likes: [] });
    }

    const userDocs = await getDocs(
      query(usersCollection, where("uid", "in", post.likes))
    );
    const likes = userDocs.docs.map((doc) => doc.data().firstName);

    res.json({ likes });
  } catch (error) {
    console.error("Error fetching likes:", error);
    res.status(500).json({ error: "Error fetching likes" });
  }
});

// Route to toggle bookmark a post
app.post("/toggle-bookmark/:postId", authenticate, async (req, res) => {
  const { postId } = req.params;
  const { uid } = req.user;

  try {
    const userDocRef = doc(usersCollection, uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userDoc.data();
    const isBookmarked = user.bookmarks && user.bookmarks.includes(postId);

    const userUpdate = isBookmarked
      ? { bookmarks: arrayRemove(postId) }
      : { bookmarks: arrayUnion(postId) };

    await updateDoc(userDocRef, userUpdate);

    res.json({
      message: `Post ${
        isBookmarked ? "unbookmarked" : "bookmarked"
      } successfully`,
      postId,
      isBookmarked,
    });
  } catch (error) {
    console.error("Error toggling bookmark:", error);
    res.status(500).json({ error: "Error toggling bookmark" });
  }
});
// Route to add a comment to a post
app.post("/add-comment", authenticate, async (req, res) => {
  const { postId, body } = req.body;
  const { uid } = req.user;

  if (!body) {
    return res.status(400).json({ error: "Comment body is required" });
  }

  try {
    const userQuery = query(usersCollection, where("uid", "==", uid));
    const userSnapshot = await getDocs(userQuery);
    if (userSnapshot.empty) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnapshot.docs[0].data();

    const comment = {
      body,
      author: userData.firstName,
      createdAt: Timestamp.fromDate(new Date()),
    };

    const postDocRef = doc(postsCollection, postId);
    await updateDoc(postDocRef, {
      comments: arrayUnion(comment),
    });

    res.json({ message: "Comment added successfully" });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Error adding comment" });
  }
});

// Route to toggle follow/unfollow a user
app.post("/toggle-follow/:userId", authenticate, async (req, res) => {
  const { uid } = req.user;
  const { userId } = req.params;

  if (uid === userId) {
    return res
      .status(400)
      .json({ error: "You cannot follow/unfollow yourself" });
  }

  try {
    const userDoc = doc(usersCollection, uid);
    const followedUserDoc = doc(usersCollection, userId);

    const userSnapshot = await getDoc(userDoc);
    const followedUserSnapshot = await getDoc(followedUserDoc);

    if (!userSnapshot.exists || !followedUserSnapshot.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnapshot.data();

    const isFollowing =
      userData.following && userData.following.includes(userId);

    if (isFollowing) {
      // Unfollow user
      await updateDoc(userDoc, {
        following: arrayRemove(userId),
      });
      await updateDoc(followedUserDoc, {
        followers: arrayRemove(uid),
      });
      res.json({ message: "User unfollowed successfully", following: false });
    } else {
      // Follow user
      await updateDoc(userDoc, {
        following: arrayUnion(userId),
      });
      await updateDoc(followedUserDoc, {
        followers: arrayUnion(uid),
      });
      res.json({ message: "User followed successfully", following: true });
    }
  } catch (error) {
    console.error("Error toggling follow:", error);
    res.status(500).json({ error: "Error toggling follow" });
  }
});

app.get("/about", (req, res) => {
  res.json({
    Team: [
      "Gal Rabinovich",
      "Lina Petrovsky",
      "Ilya Karazhya",
      "Sergei Yakima",
      "Mohamed Alfker",
      "David Aronov",
    ],
  });
});

app.get("/ping", (req, res) => {
  res.json("Pong:Team 4");
});

app.listen(PORT, () => {
  console.log(`Server started listening on port: ${PORT}`);
});
