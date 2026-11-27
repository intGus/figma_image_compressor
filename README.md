# Free Image Compressor for Figma

Effortlessly compress and export your JPEG images in Figma

## Usage

[Get the plugin on Figma](https://www.figma.com/community/plugin/1247697024251755358/Free-Image-Compressor), select the layers you want to export and run the plugin.

* Set the size with Figma's export settings on each layer (scale like 2x, or a fixed width or height). The file name gets Figma's suffix, e.g. `Hero@2x.jpg`.
* Pick a format (JPEG, WebP, AVIF or PNG) and quality. Your choices are remembered.
* Optional: a max width to scale big images down, and a background colour for transparent areas in JPEGs.
* Up to 12 layers compress straight away; for more, press Compress. You can cancel at any time.
* The table shows each file's original size, compressed size and how much was saved.
* Export downloads a ZIP, or the image itself when only one is selected.

Everything runs on your machine. Images are never uploaded anywhere.

## Installing and Contributing

The plugin is built from `src/` into `dist/` with esbuild. Every codec (MozJPEG, WebP, AVIF, PNG, Oxipng, resize) is
bundled into `dist/ui.html`, so the plugin works offline and its manifest declares no network access.

* Clone this repository: `git clone https://github.com/intGus/figma_image_compressor.git`
* Install Node.js 22.18 or newer, then run `npm install`
* Build once with `npm run build`, or rebuild on every change with `npm run watch`
* Open the Figma desktop app, then Plugins > Development > Import plugin from manifest, and pick `manifest.json`

Other scripts:

* `npm test` runs the unit tests and runs the real codecs in Node against generated images
* `npm run typecheck` type-checks the plugin and UI code
* `npm run check` does all of the above plus a build

Layout:

* `src/code.ts` plugin sandbox: reads the selection, exports PNGs, saves settings
* `src/ui/` the plugin window (`index.html` template, `styles.css`, `main.ts`)
* `src/engine/` compression: codec setup and the per-image pipeline
* `src/shared/` small pure helpers (file names, settings, pixels), covered by `test/`
* `scripts/build.mjs` the build

## License

This project is licensed under Figma's [Community Free Resource License](https://www.figma.com/community-free-resource-license/?fuid=1193733706561111205)

## Acknowledgments

* [jSquash](https://github.com/jamsinclair/jSquash) - WebAssembly builds of the Squoosh codecs (MozJPEG, libwebp, libavif, PNG, Oxipng, resize)
* [image-q](https://github.com/ibezkrovnyi/image-quantization) - colour quantization for lossy PNG
* [JSZip](https://stuk.github.io/jszip/) - A JavaScript class for generating and reading zip files 
* [Export Zip](https://github.com/brianlovin/figma-export-zip) - An easy-to-understand Zip & Export plugin:
  This code was a great resource to understand how the Figma Plugin works and how to quickly Zip files for download.