import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import benAboutPhoto from "../assets/ben-about.jpg";

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
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 2.5, md: 4 }}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" component="h1" fontWeight={800} sx={{ lineHeight: 1.08 }}>
              About WeCube
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 620 }}>
              I built WeCube to give speedcubers a simpler, more natural place to
              buy, sell, and pass along puzzles inside the community.
            </Typography>
          </Box>
          <Box
            component="img"
            src={benAboutPhoto}
            alt="Ben, founder of WeCube, at a cubing event"
            loading="eager"
            sx={{
              width: { xs: "100%", md: 300 },
              maxWidth: { xs: 420, md: 300 },
              alignSelf: { xs: "center", md: "center" },
              aspectRatio: "5 / 4",
              objectFit: "cover",
              objectPosition: "center",
              borderRadius: 2,
              boxShadow: "0 16px 36px rgba(31, 53, 99, 0.16)",
            }}
          />
        </Stack>

        <Divider />

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Why I Built WeCube
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            My name is Ben, and I have been competing and involved in the WCA
            community for more than 10 years. Growing up, cubes were expensive.
            I always wanted to try newer puzzles and upgrade my setup, but I did
            not always have the money to buy the next cube I wanted.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            Now I am in the opposite position: I have more cubes than I need,
            and I know a lot of other cubers do too. I have watched people try
            to sell old puzzles through YouTube comments, Discord channels,
            Facebook groups, group chats, and general marketplaces, but there
            was never one flowing ecosystem built specifically for cubers.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Productively Recycling Puzzles
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            WeCube exists so the community can productively recycle puzzles.
            A cube sitting unused on someone's shelf could be the exact upgrade
            another cuber has been saving for. I wanted to make that exchange
            easier, more organized, and more connected to the community that
            already understands these puzzles.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            The goal is not to turn cubing into a generic marketplace. It is to
            give cubers a dedicated place for puzzle listings, competition
            meetups, seller profiles, reviews, and safer tools that make buying
            and selling feel less scattered.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Support WeCube
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            I am building WeCube as a community-first project. Optional
            donations help cover hosting, tools, maintenance, and continued
            development. Donations do not unlock marketplace advantages, listing
            boosts, badges, or special treatment.
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
