/* global process */
import { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BackButton from "../components/BackButton";
import Screen from "../components/Screen";
import { colors } from "../theme/colors";

const DONATION_URL = process.env.EXPO_PUBLIC_DONATION_URL;

const SAFETY_SECTIONS = [
  {
    title: "Know What WeCube Does Not Verify",
    items: [
      "WeCube does not verify listings, puzzle condition, seller identity, or payment details.",
      "WeCube does not handle payments or escrow.",
      "You decide whether a listing, seller, buyer, meetup, shipping arrangement, and payment method feel trustworthy.",
    ],
  },
  {
    title: "Before Buying",
    items: [
      "Review the seller profile, photos, description, price, and fulfillment options.",
      "Ask for more photos or details if anything is unclear.",
      "Be cautious with prices that seem unusually low or requests to move quickly.",
    ],
  },
  {
    title: "Messages and Payments",
    items: [
      "Do not share passwords, verification codes, full payment credentials, bank account details, Social Security numbers, or other sensitive personal information through WeCube messages.",
      "Use a payment method you trust and understand before sending money.",
      "Avoid payment arrangements that leave you with no recourse if something goes wrong.",
    ],
  },
  {
    title: "Meetups and Reports",
    items: [
      "Meet in a public place when possible.",
      "For competition meetups, complete exchanges in appropriate public areas and follow event rules.",
      "Report listings, users, or conversations that look misleading, unsafe, abusive, or suspicious.",
    ],
  },
];

const TERMS_SECTIONS = [
  {
    title: "Marketplace Role",
    body: "WeCube provides a place for users to create listings, browse puzzles, message each other, and coordinate purchases. WeCube does not verify listings, inspect puzzles, process payments, provide escrow, or guarantee transactions.",
  },
  {
    title: "User Responsibility",
    body: "Users are responsible for their listings, messages, payment methods, and buying, selling, shipping, or meetup decisions.",
  },
  {
    title: "Payments and Fulfillment",
    body: "Payments, shipping, and meetups are arranged directly between users. WeCube is not responsible for payment disputes, failed delivery, condition disputes, chargebacks, refunds, or losses from transactions arranged through the app.",
  },
  {
    title: "Moderation",
    body: "WeCube may review reports, hide listings, restrict interactions, or take other moderation action when content or behavior appears unsafe, abusive, misleading, or harmful to the marketplace.",
  },
  {
    title: "No Guarantee",
    body: "WeCube is provided as-is. We aim to support a safer cubing marketplace, but we cannot guarantee that every listing, user, message, payment, shipment, or meetup will be safe or successful.",
  },
];

const PRIVACY_SECTIONS = [
  {
    title: "Information We Collect",
    body: "WeCube collects account information such as your email address, name, profile image, listings, listing photos, messages, reviews, reports, blocked users, and marketplace activity you choose to create in the app.",
  },
  {
    title: "How We Use Information",
    body: "We use information to provide the marketplace, show listings and profiles, support messaging, prevent abuse, review reports, moderate unsafe content, improve reliability, and operate WeCube.",
  },
  {
    title: "Public Information",
    body: "Listings, listing photos, seller profiles, reviews, and some marketplace activity may be visible to other users. Do not include private or sensitive information in public listing fields.",
  },
  {
    title: "Data Controls",
    body: "You can edit parts of your profile, delete listings, block users, delete your account, and contact support@wecube.app about account or data concerns. Some records may be retained for safety, moderation, abuse prevention, or service integrity.",
  },
];

function PolicyToggle({ activeTab, setActiveTab }) {
  const tabs = [
    { label: "About", value: "about" },
    { label: "Safety", value: "safety" },
    { label: "Terms", value: "terms" },
    { label: "Privacy", value: "privacy" },
  ];

  return (
    <View style={styles.toggleRow}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.value}
          style={[styles.toggleItem, activeTab === tab.value && styles.toggleItemActive]}
          onPress={() => setActiveTab(tab.value)}
        >
          <Text style={[styles.toggleText, activeTab === tab.value && styles.toggleTextActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SectionList({ sections }) {
  return sections.map((section) => (
    <View key={section.title} style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.body ? <Text style={styles.bodyText}>{section.body}</Text> : null}
      {section.items?.map((item) => (
        <Text key={item} style={styles.bulletText}>
          {`\u2022 ${item}`}
        </Text>
      ))}
    </View>
  ));
}

export default function InfoScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("about");

  const content = useMemo(() => {
    if (activeTab === "safety") {
      return (
        <>
          <Text style={styles.title}>Safety Guidelines</Text>
          <SectionList sections={SAFETY_SECTIONS} />
        </>
      );
    }

    if (activeTab === "terms") {
      return (
        <>
          <Text style={styles.title}>Terms & Conditions</Text>
          <SectionList sections={TERMS_SECTIONS} />
        </>
      );
    }

    if (activeTab === "privacy") {
      return (
        <>
          <Text style={styles.title}>Privacy Policy</Text>
          <SectionList sections={PRIVACY_SECTIONS} />
        </>
      );
    }

    return (
      <>
        <Text style={styles.title}>About WeCube</Text>
        <Text style={styles.subtitle}>
          WeCube is a community-first marketplace built for speedcubers to buy, sell, and discover puzzles in a simpler, more focused place.
        </Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why WeCube Exists</Text>
          <Text style={styles.bodyText}>
            Speedcubers often buy, sell, trade, and discover puzzles through scattered chats, social posts, and general marketplaces. WeCube gives the cubing community a dedicated place for puzzle listings, competition meetups, seller profiles, reviews, and safer marketplace tools.
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community-First</Text>
          <Text style={styles.bodyText}>
            WeCube is currently run as a community-first project. The goal is to support the cubing community, keep casual marketplace listings accessible, and build tools that make buying and selling puzzles feel easier and more trustworthy.
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support WeCube</Text>
          <Text style={styles.bodyText}>
            Optional donations help cover hosting, tools, maintenance, and continued development. Donations do not unlock marketplace advantages, listing boosts, badges, or special treatment.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              Linking.openURL(
                DONATION_URL || "mailto:support@wecube.app?subject=Support%20WeCube"
              )
            }
          >
            <Text style={styles.primaryButtonText}>
              {DONATION_URL ? "Donate" : "Contact to support"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>
          WeCube is not a payment processor, escrow service, or listing verification service.
        </Text>
      </>
    );
  }, [activeTab]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton navigation={navigation} />
        <PolicyToggle activeTab={activeTab} setActiveTab={setActiveTab} />
        {content}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 36,
  },
  toggleRow: {
    alignSelf: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 22,
  },
  toggleItem: {
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  toggleItemActive: {
    borderBottomColor: colors.primary,
  },
  toggleText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  toggleTextActive: {
    color: colors.primary,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  bodyText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  bulletText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    marginTop: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  disclaimer: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 24,
  },
});
