import { Box, Divider, Stack, Typography } from "@mui/material";
import PolicyTabs from "../components/PolicyTabs";

const PAGE_SX = {
  width: { xs: "100%", md: "80vw" },
  maxWidth: 900,
  mx: "auto",
  p: { xs: 2, sm: 3 },
  mt: 2,
};

const SECTIONS = [
  {
    title: "Marketplace Role",
    body: "WeCube provides a place for users to create listings, browse puzzles, message each other, and coordinate purchases. WeCube does not verify listings, inspect puzzles, process payments, provide escrow, or guarantee transactions.",
  },
  {
    title: "User Responsibility",
    body: "Users are responsible for the accuracy of their listings, the messages they send, the payment methods they choose, and the decisions they make when buying, selling, shipping, or meeting.",
  },
  {
    title: "Payments and Fulfillment",
    body: "Payments, shipping, and meetups are arranged directly between users. WeCube is not responsible for payment disputes, failed delivery, item condition disputes, chargebacks, refunds, or losses from transactions arranged through the app.",
  },
  {
    title: "Prohibited Behavior",
    body: "Do not post misleading listings, impersonate others, harass users, attempt scams, upload inappropriate content, spam the app, or use WeCube in a way that harms other users or the service.",
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

export default function Terms() {
  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={3}>
        <PolicyTabs />

        <Box>
          <Typography variant="h3" component="h1" fontWeight={700}>
            Terms & Conditions
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            These terms summarize how WeCube should be used and what users are
            responsible for.
          </Typography>
        </Box>

        <Divider />

        {SECTIONS.map((section) => (
          <Box key={section.title}>
            <Typography variant="h5" component="h2" fontWeight={700}>
              {section.title}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              {section.body}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
