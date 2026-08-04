import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import { AuthProvider } from "./src/contexts/AuthContext";
import PolicyAcceptanceGate from "./src/components/PolicyAcceptanceGate";
import { useAuth } from "./src/contexts/useAuth";
import BrowseScreen from "./src/screens/BrowseScreen";
import CompetitionsScreen from "./src/screens/CompetitionsScreen";
import ListingDetailScreen from "./src/screens/ListingDetailScreen";
import SellerProfileScreen from "./src/screens/SellerProfileScreen";
import SellScreen from "./src/screens/SellScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import InfoScreen from "./src/screens/InfoScreen";
import AuthScreen from "./src/screens/AuthScreen";
import { colors } from "./src/theme/colors";

const Tab = createBottomTabNavigator();
const BrowseStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

function AppContent() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <>
      <AppTabs />
      <PolicyAcceptanceGate />
    </>
  );
}

function BrowseNavigator() {
  return (
    <BrowseStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <BrowseStack.Screen
        name="BrowseList"
        component={BrowseScreen}
        options={{ title: "Browse" }}
      />
      <BrowseStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: "Listing" }}
      />
      <BrowseStack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ title: "Seller" }}
      />
    </BrowseStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MessagesStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <MessagesStack.Screen
        name="MessagesList"
        component={MessagesScreen}
        options={{ title: "Messages" }}
      />
      <MessagesStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ title: "Conversation" }}
      />
    </MessagesStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: "Profile" }}
      />
      <ProfileStack.Screen
        name="Info"
        component={InfoScreen}
        options={{ title: "About & Policies" }}
      />
    </ProfileStack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Browse"
        component={BrowseNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ color }}>B</Text>,
        }}
      />
      <Tab.Screen
        name="Competitions"
        component={CompetitionsScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>C</Text> }}
      />
      <Tab.Screen
        name="Sell"
        component={SellScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>+</Text> }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ color }}>M</Text>,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ color }}>P</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

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
