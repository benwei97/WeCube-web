import { StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import { colors } from "../theme/colors";

export default function SellScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Sell</Text>
        <Text style={styles.body}>
          Listing creation will be ported next, including photo upload through the staging Firebase
          Function and S3 bucket.
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
