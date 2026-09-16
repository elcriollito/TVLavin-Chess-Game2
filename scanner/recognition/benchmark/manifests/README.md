# Recognition benchmark manifests

Committed manifests are immutable, reviewable benchmark definitions. Real source images should normally remain outside Git and be referenced by stable local or governed external identifiers with SHA-256 checksums.

Model reports must record the benchmark version, byte-level manifest checksum, recognizer/model version, preprocessing version, backend, and device/browser metadata where applicable.

The `scanner-realworld-v0.1` namespace is reserved for the first governed real-world acquisition. Unit fixtures use the same schema but are explicitly excluded from performance claims.
