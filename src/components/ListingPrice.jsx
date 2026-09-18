import { Box } from "@mui/material";
import { formatListingPrice } from "../utils/listingUtils";

export default function ListingPrice({ listing }) {
  const discounted = Number.isFinite(listing.previousPrice) && listing.previousPrice > Number(listing.price);
  return <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 0.75 }}>
    <Box component="span">{formatListingPrice(listing.price)}</Box>
    {discounted && <Box component="del" aria-label="Previous price" sx={{ color: "text.secondary", fontSize: "0.75em", fontWeight: 400 }}>{formatListingPrice(listing.previousPrice)}</Box>}
  </Box>;
}
