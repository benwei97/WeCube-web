import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { AuthProvider } from "./src/contexts/AuthContext";
import PolicyAcceptanceGate from "./src/components/PolicyAcceptanceGate";
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
import { colors } from "./src/theme/colors";

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const BrowseStack = createNativeStackNavigator();
const CompetitionsStack = createNativeStackNavigator();
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
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={AppTabs} />
        <RootStack.Screen
          name="SellModal"
          component={SellScreen}
          options={{ presentation: "modal" }}
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
        headerTitleStyle: { fontWeight: "700" },
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
        headerTitleStyle: { fontWeight: "700" },
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
    </MessagesStack.Navigator>
  );
}

function CompetitionsNavigator() {
  return (
    <CompetitionsStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
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
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <ProfileStack.Screen
        name="ProfileHome"
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
            <MaterialIcons name="emoji-events" size={size} color={color} />
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
            <MaterialIcons name="chat-bubble-outline" size={size} color={color} />
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
  tabAvatar: {
    borderRadius: 999,
    borderWidth: 1.5,
  },
});

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
