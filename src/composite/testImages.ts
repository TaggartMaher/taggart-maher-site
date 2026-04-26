// Static list of test images served from /composite-test-images/. Used by
// the debug menu to populate the "image background" dropdown. Add a new
// entry here when dropping a new file in public/composite-test-images/.

export interface TestImageEntry {
  label: string;
  url: string;
}

export const testImages: TestImageEntry[] = [
  { label: "test-image", url: "/composite-test-images/test-image.png" },
  { label: "test-red", url: "/composite-test-images/test-red.png" },
];
