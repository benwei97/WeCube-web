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
              Hey, I'm Ben! I built WeCube because I wanted cubers to have an
              easier way to buy, sell, and pass along puzzles within the
              community.
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
            I've been speedcubing and competing in WCA competitions for more
            than 10 years, and cubing has been a huge part of my life.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            Growing up, I always wanted to try the newest cubes and upgrade my
            setup, but cubes were expensive and I couldn't always afford the
            next one I wanted.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            Now I have the opposite problem.{" "}
            <Box component="strong" sx={{ fontWeight: 800 }}>
              I have way too many cubes.
            </Box>{" "}
            And I know I'm not the only one.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            I've seen cubers buy and sell puzzles through Discord servers,
            Facebook groups, group chats, YouTube comments, and pretty much
            anywhere else they can find each other. It works, but it's always
            felt a little scattered.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            I built WeCube to give all of that a home.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Giving Old Cubes a New Home
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            The cube sitting untouched on your shelf might be exactly what
            another cuber has been looking for. WeCube makes it easier to pass
            it along to someone who'll actually use it, while maybe helping you
            find your next main too.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            I want WeCube to feel like something made{" "}
            <Box component="strong" sx={{ fontWeight: 800 }}>
              for cubers, by a cuber.
            </Box>{" "}
            A place for puzzle listings, competition meetups, seller profiles,
            reviews, and tools that make buying and selling within the
            community easier and safer.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" fontWeight={700}>
            Support WeCube
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.7 }}>
            WeCube is a community-first project that I'm building because I
            genuinely want it to be useful for cubers.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            Optional donations help cover hosting, tools, maintenance, and
            continued development. Donations don't give you listing boosts,
            badges, or any special treatment. They're simply a way to help keep
            WeCube running.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            Whether you list an old cube, find your next main, donate, or just
            tell another cuber about WeCube, thanks for being here. It really
            means a lot. ❤️
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
