import fs from "fs";
const target = process.argv[2];
switch (target) {
    case 'chrome':
        fs.mkdirSync('dist/assets', {recursive: true});
        fs.copyFileSync('manifest.json', 'dist/manifest.json');
        fs.cpSync('src/assets', 'dist/assets', {recursive: true});
    break;
    case 'firefox':
        fs.mkdirSync('dist-firefox/assets', {recursive: true});
        fs.copyFileSync('manifest-firefox.json', 'dist-firefox/manifest.json');
        fs.cpSync('src/assets', 'dist-firefox/assets', {recursive: true});
    break;
    default:
        console.error(`Unknown target: ${target}. Use 'chrome' or 'firefox'.`);
        process.exit(1);
    break;
}
