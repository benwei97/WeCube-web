import { Box, Divider, Stack, Typography } from "@mui/material";
import PolicyTabs from "../components/PolicyTabs";

const PAGE_SX = {
  width: "100%",
  maxWidth: 880,
  mx: "auto",
  px: { xs: 2, sm: 3 },
  py: { xs: 3, md: 5 },
};

const SECTIONS = [
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
    title: "Messages and Reports",
    body: "Messages are visible to the conversation participants. Reports may be reviewed by WeCube admins to evaluate suspicious, abusive, misleading, or unsafe activity.",
  },
  {
    title: "Service Providers",
    body: "WeCube uses third-party services such as Firebase, Vercel, AWS, Google authentication, analytics, and email-related providers to host, secure, operate, and improve the app.",
  },
  {
    title: "Data Controls",
    body: "You can edit parts of your profile, delete your listings, block users, delete your account from the dashboard, and contact support about account or data concerns. Some records may be retained where needed for safety, moderation, abuse prevention, or service integrity.",
  },
  {
    title: "Security",
    body: "We use technical safeguards such as authentication, Firestore rules, access controls, and moderation tools. No online service can guarantee perfect security.",
  },
  {
    title: "Contact",
    body: "For privacy questions or data requests, contact support@wecube.app.",
  },
];

export default function PrivacyPolicy() {
  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={{ xs: 3, md: 3.5 }}>
        <PolicyTabs />

        <Box>
          <Typography variant="h3" component="h1" fontWeight={800} sx={{ lineHeight: 1.08 }}>
            Privacy Policy
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 720 }}>
            This policy summarizes what information WeCube collects and how it is
            used to operate the marketplace.
          </Typography>
        </Box>

        <Divider />

        {SECTIONS.map((section) => (
          <Box key={section.title}>
            <Typography variant="h5" component="h2" fontWeight={700}>
              {section.title}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
              {section.body}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
