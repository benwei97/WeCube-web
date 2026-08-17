export const fontFamilies = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
  extraBold: "DMSans_800ExtraBold",
};

export const radii = {
  control: 8,
  card: 8,
  panel: 12,
};

export const typography = {
  screenTitle: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  sectionTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 23,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  button: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  listingTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 17,
  },
  listingPrice: {
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 18,
  },
};

export const elevation = {
  panel: {
    shadowColor: "#1F3563",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
  },
  card: {
    shadowColor: "#1F3563",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
};
