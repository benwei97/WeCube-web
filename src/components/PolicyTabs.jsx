import { Box, Button } from "@mui/material";
import { Link, useLocation } from "react-router-dom";

const POLICY_TABS = [
  { label: "Safety Guidelines", path: "/safety" },
  { label: "Terms & Conditions", path: "/terms" },
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
          borderBottom: "1px solid",
          borderColor: "divider",
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
                width: { xs: 142, sm: 170 },
                borderRadius: 0,
                borderBottom: "2px solid",
                borderColor: isActive ? "primary.main" : "transparent",
                color: isActive ? "primary.main" : "text.secondary",
                fontWeight: isActive ? 700 : 500,
                textTransform: "none",
                px: 1,
                pb: 0.75,
                textAlign: "center",
                "&:hover": {
                  bgcolor: "transparent",
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
