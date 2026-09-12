import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const PUSH_PROMPT_STORAGE_KEY = "wecube:pushNotificationsPrompted";
const TOKEN_DOC_ID_PREFIX = "expo_";
const MESSAGE_NOTIFICATION_TYPE = "message";

let activeConversationId = null;

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null
  );
}

function getPushTokenDocId(token) {
  return `${TOKEN_DOC_ID_PREFIX}${encodeURIComponent(token)}`;
}

function shouldHandleNotifications() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

async function askBeforeSystemPrompt() {
  const alreadyPrompted = await AsyncStorage.getItem(PUSH_PROMPT_STORAGE_KEY);
  if (alreadyPrompted) return false;

  return new Promise((resolve) => {
    Alert.alert(
      "Get message notifications?",
      "WeCube can let you know when someone messages you.",
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: async () => {
            await AsyncStorage.setItem(PUSH_PROMPT_STORAGE_KEY, "dismissed");
            resolve(false);
          },
        },
        {
          text: "Turn on",
          onPress: async () => {
            await AsyncStorage.setItem(PUSH_PROMPT_STORAGE_KEY, "accepted");
            resolve(true);
          },
        },
      ]
    );
  });
}

async function getNotificationPermission() {
  const existingPermission = await Notifications.getPermissionsAsync();
  if (existingPermission.granted) return true;

  const shouldPrompt = await askBeforeSystemPrompt();
  if (!shouldPrompt) return false;

  const requestedPermission = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return requestedPermission.granted;
}

export function setActiveNotificationConversationId(conversationId) {
  activeConversationId = conversationId || null;
}

export function getActiveNotificationConversationId() {
  return activeConversationId;
}

export function getMessageNotificationRouteData(response) {
  const data = response?.notification?.request?.content?.data || {};
  if (data.type !== MESSAGE_NOTIFICATION_TYPE || !data.conversationId) {
    return null;
  }

  return {
    conversationId: data.conversationId,
    listingId: data.listingId || null,
  };
}

export async function registerForPushNotifications(userId) {
  if (!userId || !shouldHandleNotifications()) return null;

  const hasPermission = await getNotificationPermission();
  if (!hasPermission) return null;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("Unable to register for push notifications: missing EAS project id.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const tokenDocId = getPushTokenDocId(token);

  await setDoc(
    doc(db, "users", userId, "pushTokens", tokenDocId),
    {
      token,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || "",
      disabled: false,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { token, tokenDocId };
}

export async function unregisterPushNotificationToken(userId, token) {
  if (!userId || !token) return;

  await deleteDoc(doc(db, "users", userId, "pushTokens", getPushTokenDocId(token)));
}
