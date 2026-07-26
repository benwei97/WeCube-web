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
    title: "Know What WeCube Does Not Verify",
    items: [
      "WeCube does not verify listings, puzzle condition, seller identity, or payment details.",
      "WeCube does not handle payments or escrow.",
      "You are responsible for deciding whether a listing, seller, buyer, meetup, shipping arrangement, and payment method feel trustworthy.",
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
    title: "Shipping Safety",
    items: [
      "Use a payment method you trust and understand before sending money.",
      "Consider asking for tracking information and clear photos of the puzzle before shipment.",
      "Avoid payment methods or arrangements that leave you with no recourse if something goes wrong.",
    ],
  },
  {
    title: "Messaging Safety",
    items: [
      "Do not share passwords, verification codes, full payment credentials, bank account details, Social Security numbers, or other sensitive personal information through WeCube messages.",
      "Keep communication focused on the listing, fulfillment details, and public meetup coordination.",
    ],
  },
  {
    title: "Meetup Safety",
    items: [
      "Meet in a public place when possible.",
      "For competition meetups, complete exchanges in appropriate public areas and follow event rules.",
      "Do not share sensitive personal information unnecessarily.",
    ],
  },
  {
    title: "Report Problems",
    items: [
      "Report listings, users, or conversations that look misleading, unsafe, abusive, or suspicious.",
      "Blocking a user prevents them from starting or continuing conversations with you.",
      "Reports help WeCube review marketplace safety, but they do not guarantee a refund, payment reversal, or dispute outcome.",
    ],
  },
];

export default function SafetyGuidelines() {
  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={3}>
        <PolicyTabs />

        <Box>
          <Typography variant="h3" component="h1" fontWeight={700}>
            Safety Guidelines
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            Use these guidelines when buying, selling, shipping, or meeting
            through WeCube.
          </Typography>
        </Box>

        <Divider />

        {SECTIONS.map((section) => (
          <Box key={section.title}>
            <Typography variant="h5" component="h2" fontWeight={700}>
              {section.title}
            </Typography>
            <Stack component="ul" spacing={0.75} sx={{ pl: 3, mt: 1.25, mb: 0 }}>
              {section.items.map((item) => (
                <Typography key={item} component="li" variant="body1">
                  {item}
                </Typography>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
