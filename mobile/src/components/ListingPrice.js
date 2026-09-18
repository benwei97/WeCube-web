import { Text } from "react-native";
import { formatListingPrice } from "../utils/listingUtils";
import { colors } from "../theme/colors";

export default function ListingPrice({ listing }) {
  const discounted = Number.isFinite(listing.previousPrice) && listing.previousPrice > Number(listing.price);
  return <Text>
    {formatListingPrice(listing.price)}
    {discounted && <Text accessibilityLabel="Previous price" style={{ color: colors.muted, fontSize: 14, fontWeight: "400", textDecorationLine: "line-through" }}> {formatListingPrice(listing.previousPrice)}</Text>}
  </Text>;
}
