import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { DMSans_800ExtraBold } from "@expo-google-fonts/dm-sans/800ExtraBold";
import { AuthProvider } from "./src/contexts/AuthContext";
import PolicyAcceptanceGate from "./src/components/PolicyAcceptanceGate";
import PageState from "./src/components/PageState";
import { useAuth } from "./src/contexts/useAuth";
import BrowseScreen from "./src/screens/BrowseScreen";
import CompetitionsScreen from "./src/screens/CompetitionsScreen";
import CompetitionListingsScreen from "./src/screens/CompetitionListingsScreen";
import ListingDetailScreen from "./src/screens/ListingDetailScreen";
import SellerProfileScreen from "./src/screens/SellerProfileScreen";
import SellScreen from "./src/screens/SellScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import InfoScreen from "./src/screens/InfoScreen";
import AuthScreen from "./src/screens/AuthScreen";
import { db } from "./src/lib/firebase";
import { colors } from "./src/theme/colors";
import { fontFamilies } from "./src/theme/design";
import { isConversationUnread } from "./src/utils/messaging";

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const BrowseStack = createNativeStackNavigator();
const CompetitionsStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

function AppContent() {
  const { currentUser, loading } = useAuth();
  const [fontsLoaded] = useFonts({
    [fontFamilies.regular]: DMSans_400Regular,
    [fontFamilies.medium]: DMSans_500Medium,
    [fontFamilies.semibold]: DMSans_600SemiBold,
    [fontFamilies.bold]: DMSans_700Bold,
    [fontFamilies.extraBold]: DMSans_800ExtraBold,
  });

  if (!fontsLoaded || loading) {
    return (
      <View style={styles.loadingShell}>
        <PageState
          variant="loading"
          title="Loading WeCube"
        />
      </View>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={AppTabs} />
        <RootStack.Screen
          name="SellModal"
          component={SellScreen}
          options={{ animation: "slide_from_bottom", gestureEnabled: false }}
        />
      </RootStack.Navigator>
      <PolicyAcceptanceGate />
    </>
  );
}

function BrowseNavigator() {
  return (
    <BrowseStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamilies.bold, fontWeight: "700" },
      }}
    >
      <BrowseStack.Screen
        name="BrowseList"
        component={BrowseScreen}
        options={{ headerShown: false }}
      />
      <BrowseStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ headerShown: false }}
      />
      <BrowseStack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ headerShown: false }}
      />
    </BrowseStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MessagesStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamilies.bold, fontWeight: "700" },
      }}
    >
      <MessagesStack.Screen
        name="MessagesList"
        component={MessagesScreen}
        options={{ headerShown: false }}
      />
      <MessagesStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ headerShown: false }}
      />
      <MessagesStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ headerShown: false }}
      />
      <MessagesStack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ headerShown: false }}
      />
    </MessagesStack.Navigator>
  );
}

function CompetitionsNavigator() {
  return (
    <CompetitionsStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamilies.bold, fontWeight: "700" },
      }}
    >
      <CompetitionsStack.Screen
        name="CompetitionsList"
        component={CompetitionsScreen}
        options={{ headerShown: false }}
      />
      <CompetitionsStack.Screen
        name="CompetitionListings"
        component={CompetitionListingsScreen}
        options={{ headerShown: false }}
      />
      <CompetitionsStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ headerShown: false }}
      />
      <CompetitionsStack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ headerShown: false }}
      />
    </CompetitionsStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamilies.bold, fontWeight: "700" },
      }}
    >
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ProfileSection"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Info"
        component={InfoScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ headerShown: false }}
      />
    </ProfileStack.Navigator>
  );
}

function AppTabs() {
  const { currentUser } = useAuth();
  const avatarUrl = currentUser?.avatarUrl || "";
  const [buyerConversations, setBuyerConversations] = useState([]);
  const [sellerConversations, setSellerConversations] = useState([]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setBuyerConversations([]);
      setSellerConversations([]);
      return undefined;
    }

    const buyerQuery = query(
      collection(db, "conversations"),
      where("buyerId", "==", currentUser.uid)
    );
    const sellerQuery = query(
      collection(db, "conversations"),
      where("sellerId", "==", currentUser.uid)
    );

    const unsubscribeBuyer = onSnapshot(
      buyerQuery,
      (snapshot) =>
        setBuyerConversations(
          snapshot.docs.map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
          }))
        ),
      (error) => console.error("Error loading buyer unread count:", error)
    );
    const unsubscribeSeller = onSnapshot(
      sellerQuery,
      (snapshot) =>
        setSellerConversations(
          snapshot.docs.map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
          }))
        ),
      (error) => console.error("Error loading seller unread count:", error)
    );

    return () => {
      unsubscribeBuyer();
      unsubscribeSeller();
    };
  }, [currentUser?.uid]);

  const unreadConversationCount = useMemo(
    () =>
      [...buyerConversations, ...sellerConversations].filter((conversation) =>
        isConversationUnread(conversation, currentUser?.uid)
      ).length,
    [buyerConversations, currentUser?.uid, sellerConversations]
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamilies.bold, fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontFamily: fontFamilies.medium,
          fontSize: 12,
          fontWeight: "500",
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 74,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 3,
        },
      }}
    >
      <Tab.Screen
        name="Browse"
        component={BrowseNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="storefront" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Competitions"
        component={CompetitionsNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="groups" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Sell"
        component={View}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.getParent()?.navigate("SellModal");
          },
        })}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <View style={styles.messageIconWrap}>
              <MaterialIcons name="chat-bubble-outline" size={size} color={color} />
              {unreadConversationCount > 0 ? (
                <View style={styles.messageBadge}>
                  <Text style={styles.messageBadgeText}>
                    {unreadConversationCount > 9 ? "9+" : unreadConversationCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, focused, size }) =>
            avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[
                  styles.tabAvatar,
                  {
                    borderColor: focused ? color : "transparent",
                    height: size,
                    width: size,
                  },
                ]}
              />
            ) : (
              <MaterialIcons name="person-outline" size={size} color={color} />
            ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    backgroundColor: colors.background,
    flex: 1,
  },
  tabAvatar: {
    borderRadius: 999,
    borderWidth: 1.5,
  },
  messageIconWrap: {
    position: "relative",
  },
  messageBadge: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 16,
    paddingHorizontal: 3,
    position: "absolute",
    right: -8,
    top: -6,
  },
  messageBadgeText: {
    color: "#fff",
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
  },
});

Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [{ fontFamily: fontFamilies.regular }, Text.defaultProps.style];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [
  { fontFamily: fontFamilies.regular },
  TextInput.defaultProps.style,
];

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <AppContent />
      </NavigationContainer>
    </AuthProvider>
  );
}
