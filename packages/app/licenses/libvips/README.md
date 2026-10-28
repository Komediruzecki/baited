# sharp-libvips 1.3.1 packaging notices

Verified on 2026-10-28 against the installed glibc package and the private `baited-card-art:review` Docker image's musl package. Both are version 1.3.1 and contain libvips 8.18.3. The two `versions.json` files are byte-identical; their README licensing sections are identical. Their README introductions differ only by the platform they describe.

## Preserved evidence and license texts

- `linux-x64-README.md` and `linuxmusl-x64-README.md`: exact package notices from the local installation and Docker image respectively.
- `linux-x64-versions.json` and `linuxmusl-x64-versions.json`: exact installed native-library version inventories.
- `THIRD-PARTY-NOTICES.upstream.md`: exact upstream notice table from [sharp-libvips v1.3.1](https://github.com/lovell/sharp-libvips/tree/6d80db40e9f37e311c13d1149745fcd80b5466db), commit `6d80db40e9f37e311c13d1149745fcd80b5466db`.
- `sharp-libvips-versions.properties` and `sharp-libvips-build-source.txt`: exact pinned upstream dependency revisions, source URLs, build settings and applied patches. The build script is evidence only and is not executed by Baited.
- `libvips-8.18.3-LICENSE.txt`: complete upstream libvips license from its v8.18.3 source tag.
- `LGPL-3.0.txt` and `GPL-3.0.txt`: complete GNU license texts from gnu.org. The package notices explicitly state that LGPLv3 use is through the any-later-version provision of LGPLv2 or LGPLv2.1.

Exact URLs and SHA-256 hashes appear in [`../packaging-notice-provenance.json`](../packaging-notice-provenance.json).

## Remaining distribution gap

The npm packages contain a table of 29 native projects and links, but not their full per-project copyright, license and patent notices. The matching upstream sharp-libvips release also supplies this table rather than a complete notice-text bundle. This directory therefore **does not constitute a complete native dependency notice bundle**. In particular, the table's BSD/MIT/fontconfig/FreeType/libpng/libtiff/MozJPEG/AOM entries still need their exact applicable notices collected from the recorded source versions. libnsgif appears in the upstream table but has no independent version entry in the installed version map; its source inside the pinned libvips tree needs attribution verification.

Before distributing a public Docker image or other compiled native package, finish that notice collection and verify the applicable LGPL/GPL source and relinking provisions against the actual packaging. Recording source URLs and full license texts here is not a claim that all distribution obligations are satisfied. This review did not publish the Docker image or change any native library.
