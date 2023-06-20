# Free Image Compressor for Figma

Effortlessly compress and export your JPEG images in Figma

## Usage

[Get the plugin on Figma](https://www.figma.com/community/plugin/1247697024251755358/Free-Image-Compressor) then select the elements you want to compress and export, select the desired scale in Figma's export settings, run the plugin, choose the compression level, press calculate for accurate file size and then export and save.

## Installing and Contributing

Below are the steps to get your plugin running. You can also find detailed instructions at: https://www.figma.com/plugin-docs/plugin-quickstart-guide/

* Create a directory and clone this repository https://github.com/intGus/figma_image_compressor.git
* Open the directory and run `npm install`
* Open this directory in Visual Studio Code.
* Compile TypeScript to JavaScript: Run the "Terminal > Run Build Task..." menu item,
    then select "npm: watch". You will have to do this again every time
    you reopen Visual Studio Code.
* Open the Figma App (Plugin development can be done only on the app)
* Click the Figma Menu and select Plugins > Development > Import plugin from manifest
* Find the directory where the repository was cloned and select the manifest.json file

Now you can run the plugin in your local environment. 

## License

This project is licensed under Figma's [Community Free Resource License](https://www.figma.com/community-free-resource-license/?fuid=1193733706561111205)

## Acknowledgments

* [JSZip v3.6.0](http://stuartk.com/jszip) - A JavaScript class for generating and reading zip files 
* [Export Zip](https://github.com/brianlovin/figma-export-zip) - An easy-to-understand Zip & Export plugin:
  This code was a great resource to understand how the Figma Plugin works and how to quickly Zip files for download.