import { Box, Button } from "@mui/material";
import { Link, useLocation } from "react-router-dom";

const POLICY_TABS = [
  { label: "Safety Guidelines", path: "/safety" },
  { label: "Terms & Conditions", path: "/terms" },
  { label: "Privacy Policy", path: "/privacy" },
];

export default function PolicyTabs() {
  const location = useLocation();

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "inline-flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 0.5,
          p: 0.5,
          bgcolor: "rgba(255, 255, 255, 0.82)",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        {POLICY_TABS.map((tab) => {
          const isActive = location.pathname === tab.path;

          return (
            <Button
              key={tab.path}
              component={Link}
              to={tab.path}
              variant="text"
              color="inherit"
              size="small"
              sx={{
                minWidth: 0,
                width: { xs: 112, sm: 170 },
                borderRadius: 1.5,
                color: isActive ? "primary.main" : "text.secondary",
                bgcolor: isActive ? "primary.50" : "transparent",
                fontWeight: isActive ? 700 : 500,
                textTransform: "none",
                px: 1,
                py: 0.9,
                textAlign: "center",
                boxShadow: "none",
                "&:hover": {
                  bgcolor: "primary.50",
                  color: "primary.main",
                },
              }}
            >
              {tab.label}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
