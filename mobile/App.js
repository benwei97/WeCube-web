import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import { AuthProvider } from "./src/contexts/AuthContext";
import { useAuth } from "./src/contexts/useAuth";
import BrowseScreen from "./src/screens/BrowseScreen";
import ListingDetailScreen from "./src/screens/ListingDetailScreen";
import SellScreen from "./src/screens/SellScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import AuthScreen from "./src/screens/AuthScreen";
import { colors } from "./src/theme/colors";

const Tab = createBottomTabNavigator();
const BrowseStack = createNativeStackNavigator();

function ProtectedScreen({ children }) {
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

  return children;
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
    </BrowseStack.Navigator>
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
        name="Sell"
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>+</Text> }}
      >
        {() => (
          <ProtectedScreen>
            <SellScreen />
          </ProtectedScreen>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Messages"
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>M</Text> }}
      >
        {() => (
          <ProtectedScreen>
            <MessagesScreen />
          </ProtectedScreen>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>P</Text> }}
      >
        {() => (
          <ProtectedScreen>
            <ProfileScreen />
          </ProtectedScreen>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <AppTabs />
      </NavigationContainer>
    </AuthProvider>
  );
}
