# Sample Report Photo Sources

The sample report ([Sample-Customer-Inspection-Report.pdf](./Sample-Customer-Inspection-Report.pdf), demo job `WD-261025-D003`, public link `/inspection/report/demo-factual-nissan-sunny-2026`) is not a real inspection. Its observations and measurements are fictional sample data in The Wheeler Dealers' fact-only format. The reference photographs show the related 2024 Nissan Versa SR, not the report's Nissan Sunny. They must not be used as evidence of defects, mileage, identity, or GCC specification.

All three photographs are by **Deathpallie325**, via Wikimedia Commons, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Local copies were resized to 1600 pixels wide and JPEG-compressed, with no other image edits. No endorsement is implied.

| View | Original Source |
| --- | --- |
| Front | [2024 Nissan Versa front view.jpg](https://commons.wikimedia.org/wiki/File:2024_Nissan_Versa_front_view.jpg) |
| Rear | [2024 Nissan Versa rear view.jpg](https://commons.wikimedia.org/wiki/File:2024_Nissan_Versa_rear_view.jpg) |
| Interior | [2024 Nissan Versa interior.jpg](https://commons.wikimedia.org/wiki/File:2024_Nissan_Versa_interior.jpg) |

The files are committed under `public/samples/nissan-sunny/` so the demo report renders in production too (real inspection photos are stored in Vercel Blob, never in the repo). The demo job can be re-seeded with `node --experimental-strip-types scripts/seed-demo-report-factual.mts` (local tooling, git-ignored). No notifications or payments are triggered by the seed.
