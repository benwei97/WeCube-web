import { Box, Button, Divider, Stack, Typography } from "@mui/material";

const PAGE_SX = {
  width: "100%",
  maxWidth: 880,
  mx: "auto",
  px: { xs: 2, sm: 3 },
  py: { xs: 3, md: 5 },
};

const DONATION_URL = import.meta.env.VITE_DONATION_URL;

export default function About() {
  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={{ xs: 3, md: 3.5 }}>
        <Box>
          <Typography variant="h3" component="h1" fontWeight={800} sx={{ lineHeight: 1.08 }}>
            About WeCube
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 720 }}>
            WeCube is a community-first marketplace built for speedcubers to
            buy, sell, and discover puzzles in a simpler, more focused place.
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Why WeCube Exists
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            Speedcubers often buy, sell, trade, and discover puzzles through
            scattered chats, social posts, and general marketplaces. WeCube was
            built to give the cubing community a dedicated place for puzzle
            listings, competition meetups, seller profiles, reviews, and safer
            marketplace tools.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Community-First
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            WeCube is currently run as a community-first project. The goal is to
            support the cubing community, keep casual marketplace listings
            accessible, and build tools that make buying and selling puzzles
            feel easier and more trustworthy.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Support WeCube
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            Optional donations help cover hosting, tools, maintenance, and
            continued development. Donations do not unlock marketplace
            advantages, listing boosts, badges, or special treatment.
          </Typography>
          <Button
            href={DONATION_URL || "mailto:support@wecube.app?subject=Support%20WeCube"}
            target={DONATION_URL ? "_blank" : undefined}
            rel={DONATION_URL ? "noreferrer" : undefined}
            variant="contained"
            sx={{ mt: 2 }}
          >
            {DONATION_URL ? "Donate" : "Contact to Support"}
          </Button>
        </Box>

        <Divider />

        <Typography variant="body2" color="text.secondary">
          WeCube is not a payment processor, escrow service, or listing
          verification service. Users arrange purchases, shipping, and meetups
          directly with each other.
        </Typography>
      </Stack>
    </Box>
  );
}
