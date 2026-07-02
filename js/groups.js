// ==========================================================================
// groups.js
// Group chat creation and management: info editing, icon, membership,
// and admin permissions.
// ==========================================================================

import { db, SERVER_TIMESTAMP } from "./firebase-config.js";
import { uploadGroupIcon } from "./storage.js";
import { generateAvatar, uid as genUid } from "./utilities.js";
import { touchRecentGroupChat } from "./contacts.js";

/**
 * Create a new group chat.
 * @param {string} creatorUid
 * @param {string} name
 * @param {string[]} memberUids - does NOT need to include creator, it's added automatically
 */
export async function createGroup(creatorUid, name, memberUids = []) {
  if (!name || name.trim().length < 2) throw new Error("Group name must be at least 2 characters.");

  const groupId = `group_${genUid("g")}`;
  const allMembers = Array.from(new Set([creatorUid, ...memberUids]));

  const members = {};
  const admins = {};
  allMembers.forEach((uid) => (members[uid] = true));
  admins[creatorUid] = true;

  const group = {
    id: groupId,
    type: "group",
    name: name.trim(),
    icon: generateAvatar(name.trim()),
    description: "",
    createdBy: creatorUid,
    createdAt: SERVER_TIMESTAMP,
    members,
    admins,
  };

  await db.ref(`groups/${groupId}`).set(group);

  await touchRecentGroupChat(groupId, allMembers, {
    text: `${name.trim()} group created`,
    type: "system",
    senderId: creatorUid,
  });

  return groupId;
}

/** Fetch a group's data once. */
export async function getGroup(groupId) {
  const snap = await db.ref(`groups/${groupId}`).get();
  return snap.exists() ? snap.val() : null;
}

/** Watch a group's data live. */
export function watchGroup(groupId, callback) {
  const ref = db.ref(`groups/${groupId}`);
  const listener = ref.on("value", (snap) => callback(snap.val()));
  return () => ref.off("value", listener);
}

/** Update group name and/or description (admin only — enforced by security rules too). */
export async function updateGroupInfo(groupId, { name, description }) {
  const updates = {};
  if (name !== undefined) {
    if (!name || name.trim().length < 2) throw new Error("Group name must be at least 2 characters.");
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description.trim().slice(0, 300);
  await db.ref(`groups/${groupId}`).update(updates);
}

/** Change the group icon. */
export async function changeGroupIcon(groupId, file, onProgress) {
  const result = await uploadGroupIcon(groupId, file, onProgress);
  await db.ref(`groups/${groupId}`).update({ icon: result.url });
  return result.url;
}

/** Add members to a group (admin only). */
export async function addGroupMembers(groupId, memberUids) {
  const updates = {};
  memberUids.forEach((uid) => (updates[`groups/${groupId}/members/${uid}`] = true));
  await db.ref().update(updates);

  const group = await getGroup(groupId);
  const allMembers = Object.keys(group.members || {});
  await touchRecentGroupChat(groupId, allMembers, {
    text: "New members were added to the group",
    type: "system",
    senderId: "system",
  });
}

/** Remove a member from a group (admin only). Also revokes admin status. */
export async function removeGroupMember(groupId, memberUid) {
  const updates = {};
  updates[`groups/${groupId}/members/${memberUid}`] = null;
  updates[`groups/${groupId}/admins/${memberUid}`] = null;
  await db.ref().update(updates);
}

/** Let a member leave the group voluntarily. */
export async function leaveGroup(groupId, uid) {
  return removeGroupMember(groupId, uid);
}

/** Promote a member to admin. */
export async function makeGroupAdmin(groupId, memberUid) {
  await db.ref(`groups/${groupId}/admins/${memberUid}`).set(true);
}

/** Demote an admin back to regular member. */
export async function removeGroupAdmin(groupId, memberUid) {
  await db.ref(`groups/${groupId}/admins/${memberUid}`).remove();
}

/** Check whether a user is an admin of a group. */
export function isGroupAdmin(group, uid) {
  return !!(group && group.admins && group.admins[uid]);
}

/** Fetch full profile objects for a group's members. */
export async function getGroupMemberProfiles(group) {
  const uids = Object.keys(group.members || {});
  const profiles = await Promise.all(
    uids.map(async (uid) => {
      const snap = await db.ref(`users/${uid}`).get();
      return snap.exists() ? { ...snap.val(), isAdmin: !!(group.admins && group.admins[uid]) } : null;
    })
  );
  return profiles.filter(Boolean);
}
