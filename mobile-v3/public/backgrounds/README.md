# Background asset map

Source files are from `/Users/devin/mac2/file/planet`. They were classified only by filename, format, dimensions, and aspect ratio; no semantic image-content analysis was used.

| Source group | Source size | Generated use |
|---|---:|---|
| `Onboarding.jpg` | 1024×1024 | Authentication page background |
| `EmptyState.jpg` | 1024×1024 | Empty family/pet state |
| `logo1.jpg` | 1024×1024 | Account and desktop brand atmosphere |
| `today1–4.jpg` | 1024×1024 | Today summary, next item, schedule, and insight sections |
| `family1–4` | 832×1248 | Family cards, family detail, created/joined family variants |
| `pet1–4.jpg` | 832×1248 | Pet cards, pet detail, and newly created pet variant |

All runtime copies are WebP at quality 82. Background placement uses centered `cover` cropping and a deterministic gradient overlay so text contrast does not depend on the underlying image.

`mobile-v2_ignore_today1` is intentionally not used.
