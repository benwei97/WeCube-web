import { Box, Typography } from "@mui/material";
import { Groups, LocalShipping, LocationOn } from "@mui/icons-material";

const ICON_BY_FULFILLMENT_TYPE = {
  local: LocationOn,
  competition: Groups,
  shipping: LocalShipping,
};

export default function ListingFulfillmentLine({ option }) {
  if (!option) {
    return null;
  }

  const Icon = ICON_BY_FULFILLMENT_TYPE[option.type];

  return (
    <Box
      className="listing-fulfillment-line"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        minWidth: 0,
        color: "text.secondary",
      }}
    >
      {Icon && <Icon fontSize="small" sx={{ flexShrink: 0 }} />}
      <Typography
        className="listing-fulfillment-text"
        variant="body2"
        sx={{
          fontWeight: 500,
          lineHeight: 1.15,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {option.label}
      </Typography>
    </Box>
  );
}
