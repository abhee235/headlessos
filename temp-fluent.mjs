import * as fi from '@fluentui/react-icons';
const names = Object.keys(fi).filter(k => 
  /Gauge|Terminal|Folder|Server|Shield|Globe|Robot|Telescope|Gear|Monitor|HardDrive|Wrench|Network|Rocket|Sparkle|Speedometer|Binoculars|Wand|Package|Palette|Lock|Desktop|Dashboard|Docker|Activity|Chart|Settings|Board/i.test(k)
).sort();
console.log('Fluent total exports:', Object.keys(fi).length);
console.log('Relevant (first 80):\n' + names.slice(0, 80).join('\n'));
console.log('\n... and', names.length - 80, 'more');
