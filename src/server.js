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
  writeBatch,
} = require("firebase/firestore");
const admin = require("firebase-admin");
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
    // Generate a unique post ID
    const postID = `${uid}_${Date.now()}`;
    const postDoc = doc(postsCollection, postID);

    // Create the post document
    await setDoc(postDoc, {
      title: title,
      body: body,
      author: authorObj.firstName,
      createdAt: Timestamp.fromDate(new Date()), // Use Firestore timestamp
      uid: uid,
      likes: [],
      comments: [],
      likeCount: 0,
      sharedPosts: [],
      reposts: [],
    });

    // Reference to the user document
    const userDoc = doc(usersCollection, uid);
    const userSnap = await getDoc(userDoc);

    if (userSnap.exists()) {
      // Check if the posts array exists
      const userData = userSnap.data();
      if (userData.posts && Array.isArray(userData.posts)) {
        // If posts array exists, update it
        await updateDoc(userDoc, {
          posts: arrayUnion(postID),
        });
      } else {
        // If posts array doesn't exist, create it with the new post ID
        await updateDoc(userDoc, {
          posts: [postID],
        });
      }
    } else {
      // If the user document doesn't exist, handle this case appropriately
      return res.status(404).json({ error: "User not found" });
    }

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
// Route to fetch an original post by ID
app.get("/posts/:postId", async (req, res) => {
  const { postId } = req.params;

  try {
    const postDoc = doc(db, "posts", postId);
    const postSnapshot = await getDoc(postDoc);

    if (!postSnapshot.exists()) {
      return res.status(404).json({ error: "Post not found" });
    }

    const postData = postSnapshot.data();
    res.json({ id: postSnapshot.id, ...postData });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Error fetching post" });
  }
});

// Route to edit a post
app.put("/edit-post/:postId", authenticate, async (req, res) => {
  const { uid } = req.user; // Get UID from the token
  const { postId } = req.params;
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required" });
  }

  try {
    const userDocRef = doc(usersCollection, uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userDoc.data();

    const postDocRef = doc(postsCollection, postId);
    const postDoc = await getDoc(postDocRef);

    if (!postDoc.exists()) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postDoc.data();

    if (post.uid !== uid && !user.isAdmin && post.repostedByUid !== uid) {
      return res.status(403).json({
        error: "You can only edit your own posts or you need admin rights",
      });
    }

    // Update the post
    await updateDoc(postDocRef, { title, body });

    // If it's the original post, update all shared posts
    if (!post.originalPostId) {
      const batch = writeBatch(db);

      if (post.sharedPosts && post.sharedPosts.length > 0) {
        post.sharedPosts.forEach((sharedPostId) => {
          const sharedPostDoc = doc(db, "posts", sharedPostId);
          batch.update(sharedPostDoc, { title, body });
        });
      }

      await batch.commit();
    }

    res.json({
      message: "Post updated successfully",
      updatedPost: { ...post, title, body },
    });
  } catch (error) {
    console.error("Error editing post:", error);
    res.status(500).json({ error: "Error editing post" });
  }
});

// Route to share a post
app.post("/share-post/:postId", authenticate, async (req, res) => {
  const { uid } = req.user; // Get UID from the token
  const { postId } = req.params;
  const user = JSON.parse(req.headers.user); // Get user data from the headers
  console.log(postId);

  try {
    const postDoc = doc(db, "posts", postId);
    const postSnapshot = await getDoc(postDoc);

    if (!postSnapshot.exists()) {
      return res.status(404).json({ error: "Post not found" });
    }

    const originalPostId = postSnapshot.data().originalPostId || postId;
    const originalPostDoc = doc(db, "posts", originalPostId);
    const originalPostSnapshot = await getDoc(originalPostDoc);

    if (!originalPostSnapshot.exists()) {
      return res.status(404).json({ error: "Original post not found" });
    }

    const originalPost = originalPostSnapshot.data();
    const sharedPost = {
      ...originalPost,
      sharedBy: user.firstName,
      sharedByUid: uid,
      createdAt: Timestamp.fromDate(new Date()), // Use current timestamp for createdAt
      originalPostTimestamp: originalPost.createdAt, // Store the original post's creation timestamp
      originalPostId: originalPostId, // Ensure reference to the original post ID
      comments: [], // Initialize an empty comments array for the shared post
      likes: [], // Initialize an empty likes array for the shared post
      likeCount: 0, // Initialize the like count to 0 for the shared post
      reposts: [], // Initialize the reposts array to empty
      sharedPosts: [], // Initialize the sharedPosts array to empty
    };

    const sharedPostDoc = doc(postsCollection, `${uid}_shared_${Date.now()}`);
    await setDoc(sharedPostDoc, sharedPost);

    // Add shared post ID to the original post's shared list
    await updateDoc(originalPostDoc, {
      sharedPosts: arrayUnion(sharedPostDoc.id),
    });

    // Reference to the user document
    const userDoc = doc(usersCollection, uid);
    const userSnap = await getDoc(userDoc);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.posts && Array.isArray(userData.posts)) {
        await updateDoc(userDoc, {
          posts: arrayUnion(sharedPostDoc.id),
        });
      } else {
        await updateDoc(userDoc, {
          posts: [sharedPostDoc.id],
        });
      }
    } else {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Post shared successfully",
      sharedPostId: sharedPostDoc.id,
    });
  } catch (error) {
    console.error("Error sharing post:", error);
    res.status(500).json({ error: "Error sharing post" });
  }
});

// Route to repost a post
app.post("/repost/:postId", authenticate, async (req, res) => {
  const { uid } = req.user; // Get UID from the token
  const { postId } = req.params;
  const { title, body } = req.body; // New title and body for the repost

  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required" });
  }

  try {
    const postDoc = doc(db, "posts", postId);
    const postSnapshot = await getDoc(postDoc);

    if (!postSnapshot.exists()) {
      return res.status(404).json({ error: "Post not found" });
    }
    const user = JSON.parse(req.headers.user);

    const repost = {
      author: postSnapshot.data().author,
      title, // New title for the repost
      body, // New body for the repost
      repostedBy: user.firstName,
      repostedByUid: user.uid,
      createdAt: Timestamp.fromDate(new Date()),
      originalPostId: postId,
      comments: [], // Initialize an empty comments array for the repost
      likes: [], // Initialize an empty likes array for the repost
      likeCount: 0, // Initialize the like count to 0 for the repost
      reposts: [], // Initialize the reposts array to empty
      sharedPosts: [], // Initialize the sharedPosts array to empty
    };

    const repostDoc = doc(postsCollection, `${uid}_repost_${Date.now()}`);
    await setDoc(repostDoc, repost);

    // Add repost ID to the original post's reposts list
    await updateDoc(postDoc, {
      reposts: arrayUnion(repostDoc.id),
    });

    // Reference to the user document
    const userDoc = doc(usersCollection, uid);
    const userSnap = await getDoc(userDoc);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.posts && Array.isArray(userData.posts)) {
        await updateDoc(userDoc, {
          posts: arrayUnion(repostDoc.id),
        });
      } else {
        await updateDoc(userDoc, {
          posts: [repostDoc.id],
        });
      }
    } else {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Post reposted successfully",
      repostId: repostDoc.id,
    });
  } catch (error) {
    console.error("Error reposting post:", error);
    res.status(500).json({ error: "Error reposting post" });
  }
});
const deletePost = async (
  postId,
  uid,
  db,
  postsCollection,
  usersCollection
) => {
  const userDocRef = doc(usersCollection, uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    throw new Error("User not found");
  }

  const user = userDoc.data();

  const postDocRef = doc(postsCollection, postId);
  const postDoc = await getDoc(postDocRef);

  if (!postDoc.exists()) {
    console.log("Post not found or already deleted:", postId);
    return;
  }

  const post = postDoc.data();

  if (
    post.uid !== uid &&
    !user.isAdmin &&
    post.sharedByUid !== uid &&
    post.repostedByUid !== uid
  ) {
    throw new Error(
      "You can only delete your own posts or you need admin rights."
    );
  }

  const batch = writeBatch(db);

  // Handle original posts with shared instances
  if (post.sharedPosts && post.sharedPosts.length > 0) {
    post.sharedPosts.forEach((sharedPostId) => {
      const sharedPostDoc = doc(db, "posts", sharedPostId);
      batch.delete(sharedPostDoc);
    });
  }

  // Handle original posts with repost instances
  if (post.reposts && post.reposts.length > 0) {
    post.reposts.forEach((repostId) => {
      const repostDoc = doc(db, "posts", repostId);
      batch.delete(repostDoc);
    });
  }

  // Handle shared posts
  if (post.originalPostId && post.sharedByUid) {
    const originalPostDoc = doc(db, "posts", post.originalPostId);
    const originalPostSnapshot = await getDoc(originalPostDoc);

    if (originalPostSnapshot.exists()) {
      const originalPostData = originalPostSnapshot.data();
      const updatedSharedPosts = originalPostData.sharedPosts.filter(
        (id) => id !== postId
      );
      batch.update(originalPostDoc, { sharedPosts: updatedSharedPosts });
    }
  }

  // Handle reposts
  if (post.originalPostId && post.repostedByUid) {
    const originalPostDoc = doc(db, "posts", post.originalPostId);
    const originalPostSnapshot = await getDoc(originalPostDoc);

    if (originalPostSnapshot.exists()) {
      const originalPostData = originalPostSnapshot.data();
      const updatedReposts = originalPostData.reposts.filter(
        (id) => id !== postId
      );
      batch.update(originalPostDoc, { reposts: updatedReposts });
    }
  }

  // Finally, delete the post itself
  batch.delete(postDocRef);

  await batch.commit();
};
app.delete("/delete-post/:postId", authenticate, async (req, res) => {
  const { postId } = req.params;
  const { uid } = req.user;

  try {
    await deletePost(postId, uid, db, postsCollection, usersCollection);
    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: error.message });
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

    if (!postDoc.exists()) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postDoc.data();
    const likes = post.likes || []; // Ensure likes is an array
    const likeNames = [];

    if (likes.length > 0) {
      for (const uid of likes) {
        const userDoc = doc(db, "users", uid);
        const userSnapshot = await getDoc(userDoc);
        if (userSnapshot.exists()) {
          likeNames.push(userSnapshot.data().firstName);
        }
      }
    }

    res.json({ likes: likeNames });
  } catch (error) {
    console.error("Error fetching like names:", error);
    res.status(500).json({ error: "Error fetching like names" });
  }
});

// Route to toggle bookmark a post
app.post("/toggle-bookmark/:postId", authenticate, async (req, res) => {
  const { postId } = req.params;
  const { uid } = req.user;

  try {
    const userDocRef = doc(usersCollection, uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
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
      const updatedUserDoc = await getDoc(userDoc);
      const updatedUserData = updatedUserDoc.data();
      res.json({
        message: "User unfollowed successfully",
        following: false,
        user: updatedUserData,
      });
    } else {
      // Follow user
      await updateDoc(userDoc, {
        following: arrayUnion(userId),
      });
      await updateDoc(followedUserDoc, {
        followers: arrayUnion(uid),
      });
      res.json({
        message: "User followed successfully",
        following: true,
      });
    }
  } catch (error) {
    console.error("Error toggling follow:", error);
    res.status(500).json({ error: "Error toggling follow" });
  }
});

// Route to get user data by UID
app.get("/user/:uid", authenticate, async (req, res) => {
  const { uid } = req.params;
  const { uid: authenticatedUid } = req.user;

  try {
    const userDoc = doc(usersCollection, uid);
    const userSnapshot = await getDoc(userDoc);

    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnapshot.data();

    if (uid === authenticatedUid) {
      // If the authenticated user is requesting their own data, return all data
      res.json(userData);
    } else {
      // If the authenticated user is requesting another user's data, return only public data
      const publicData = {
        firstName: userData.firstName,
        email: userData.email,
        followersCount: userData.followers ? userData.followers.length : 0,
        followingCount: userData.following ? userData.following.length : 0,
        posts: userData.posts || [],
        uid: userData.uid,
      };
      res.json(publicData);
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Error fetching user data" });
  }
});

// Route to get liked posts of a user
app.get("/liked-posts/:userId", authenticate, async (req, res) => {
  const { userId } = req.params;

  try {
    // Reference to the user document
    const userDoc = doc(usersCollection, userId);
    const userSnap = await getDoc(userDoc);

    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data();
    const likedPosts = userData.likedPosts || [];

    // Array to store the posts that exist
    const validPosts = [];
    // Array to store the IDs of posts that have been deleted
    const invalidPostIds = [];

    // Fetch posts from the likedPosts array
    for (const postId of likedPosts) {
      const postDoc = doc(postsCollection, postId);
      const postSnap = await getDoc(postDoc);

      if (postSnap.exists()) {
        validPosts.push({ id: postId, ...postSnap.data() });
      } else {
        invalidPostIds.push(postId);
      }
    }

    // If there are invalid post IDs, update the user's likedPosts array
    if (invalidPostIds.length > 0) {
      const updatedLikedPosts = likedPosts.filter(
        (postId) => !invalidPostIds.includes(postId)
      );

      await updateDoc(userDoc, {
        likedPosts: updatedLikedPosts,
      });

      console.log(`Updated likedPosts array for user ${userId}`);
    }

    res.json({
      message: "Liked posts retrieved successfully",
      posts: validPosts,
    });
  } catch (error) {
    console.error("Error retrieving liked posts:", error);
    res.status(500).json({ error: "Error retrieving liked posts" });
  }
});
// Route to get bookmarked posts of a user
app.get("/bookmarked-posts/:userId", authenticate, async (req, res) => {
  const { userId } = req.params;

  try {
    // Reference to the user document
    const userDoc = doc(usersCollection, userId);
    const userSnap = await getDoc(userDoc);

    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data();
    const bookmarks = userData.bookmarks || [];

    // Array to store the posts that exist
    const validPosts = [];
    // Array to store the IDs of posts that have been deleted
    const invalidPostIds = [];

    // Fetch posts from the bookmarks array
    for (const postId of bookmarks) {
      const postDoc = doc(postsCollection, postId);
      const postSnap = await getDoc(postDoc);

      if (postSnap.exists()) {
        validPosts.push({ id: postId, ...postSnap.data() });
      } else {
        invalidPostIds.push(postId);
      }
    }

    // If there are invalid post IDs, update the user's bookmarks array
    if (invalidPostIds.length > 0) {
      const updatedBookmarks = bookmarks.filter(
        (postId) => !invalidPostIds.includes(postId)
      );

      await updateDoc(userDoc, {
        bookmarks: updatedBookmarks,
      });

      console.log(`Updated bookmarks array for user ${userId}`);
    }

    res.json({
      message: "Bookmarked posts retrieved successfully",
      posts: validPosts,
    });
  } catch (error) {
    console.error("Error retrieving bookmarked posts:", error);
    res.status(500).json({ error: "Error retrieving bookmarked posts" });
  }
});
// Route to get user's own posts
app.get("/user-posts/:userId", authenticate, async (req, res) => {
  const { userId } = req.params;

  try {
    // Reference to the user document
    const userDoc = doc(usersCollection, userId);
    const userSnap = await getDoc(userDoc);

    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data();
    const userPosts = userData.posts || [];

    // Array to store the posts that exist
    const validPosts = [];
    // Array to store the IDs of posts that have been deleted
    const invalidPostIds = [];

    // Fetch posts from the user's posts array
    for (const postId of userPosts) {
      const postDoc = doc(postsCollection, postId);
      const postSnap = await getDoc(postDoc);

      if (postSnap.exists()) {
        validPosts.push({ id: postId, ...postSnap.data() });
      } else {
        invalidPostIds.push(postId);
      }
    }

    // If there are invalid post IDs, update the user's posts array
    if (invalidPostIds.length > 0) {
      const updatedUserPosts = userPosts.filter(
        (postId) => !invalidPostIds.includes(postId)
      );

      await updateDoc(userDoc, {
        posts: updatedUserPosts,
      });

      console.log(`Updated posts array for user ${userId}`);
    }

    res.json({
      message: "User's posts retrieved successfully",
      posts: validPosts,
    });
  } catch (error) {
    console.error("Error retrieving user's posts:", error);
    res.status(500).json({ error: "Error retrieving user's posts" });
  }
});
// Route to get user statistics
app.get("/user-statistics/:userId", authenticate, async (req, res) => {
  const { userId } = req.params;

  try {
    // Reference to the user document
    const userDoc = doc(usersCollection, userId);
    const userSnap = await getDoc(userDoc);

    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data();

    // Calculate the statistics
    const followingCount = userData.following ? userData.following.length : 0;
    const followersCount = userData.followers ? userData.followers.length : 0;
    const bookmarkedCount = userData.bookmarks ? userData.bookmarks.length : 0;
    const likedPostsCount = userData.likedPosts
      ? userData.likedPosts.length
      : 0;
    const postsCount = userData.posts ? userData.posts.length : 0;

    // Return the statistics
    res.json({
      followingCount,
      followersCount,
      likedPostsCount,
      postsCount,
      bookmarkedCount,
    });
  } catch (error) {
    console.error("Error retrieving user statistics:", error);
    res.status(500).json({ error: "Error retrieving user statistics" });
  }
});

app.post("/change-password", authenticate, async (req, res) => {
  const { newPassword } = req.body;
  const { uid } = req.user;

  if (!newPassword) {
    return res.status(400).json({ message: "New password is required." });
  }

  // Validate the new password using the passwordValidationHandler
  const passwordValid =
    passwordValidationHandler.passwordValidation(newPassword);
  if (!passwordValid) {
    return res.status(400).json({
      message:
        "The password must be at least 8 characters long, contain at least one uppercase letter, and include at least one symbol.",
    });
  }

  try {
    // Update the user's password using Firebase Admin SDK
    await admin.auth().updateUser(uid, { password: newPassword });
    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Error changing password:", error);
    res
      .status(500)
      .json({ message: "Error changing password.", error: error.message });
  }
});

app.delete("/delete-account", authenticate, async (req, res) => {
  const { uid } = req.user;

  try {
    const userDocRef = doc(usersCollection, uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userDoc.data();
    const userPosts = user.posts || [];

    // Delete all user's posts
    for (const postId of userPosts) {
      await deletePost(postId, uid, db, postsCollection, usersCollection);
    }

    // Delete the user document from Firestore
    await deleteDoc(userDocRef);

    // Delete the user's authentication record from Firebase Authentication
    await admin.auth().deleteUser(uid);

    res.json({ message: "User and all their posts deleted successfully." });
  } catch (error) {
    console.error("Error deleting user and posts:", error);
    res.status(500).json({ error: "Error deleting user and posts." });
  }
});

app.put("/update-name", authenticate, async (req, res) => {
  const { firstName } = req.body;
  const { uid } = req.user;

  if (!firstName || typeof firstName !== "string") {
    return res.status(400).json({ message: "Invalid first name provided." });
  }

  try {
    const userDocRef = doc(usersCollection, uid);

    // Update the first name in the user's document
    await updateDoc(userDocRef, { firstName });

    res.json({ message: "Name updated successfully." });
  } catch (error) {
    console.error("Error updating name:", error);
    res
      .status(500)
      .json({ message: "Error updating name.", error: error.message });
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
