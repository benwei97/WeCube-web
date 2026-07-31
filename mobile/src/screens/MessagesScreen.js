import { StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import { colors } from "../theme/colors";

export default function MessagesScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.body}>
          Conversation list and chat detail screens will reuse the same Firestore conversations and
          messages collections as the web app.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
});
