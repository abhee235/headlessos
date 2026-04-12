import * as ph from '@phosphor-icons/react';
const names = Object.keys(ph).filter(k => 
  /Gauge|Terminal|Folder|Server|Shield|Globe|Robot|Telescope|Gear|Monitor|HardDrive|Wrench|Network|Rocket|Sparkle|Speedometer|Binoculars|MagicWand|Package|Sliders|Palette|Lock|GlobeHemisphere|GlobeSimple|Circuitry|Desktop/i.test(k)
).sort();
console.log('Phosphor relevant:\n' + names.join('\n'));

console.log('\n--- Tabler ---');
import * as tb from '@tabler/icons-react';
const tnames = Object.keys(tb).filter(k => 
  /Gauge|Terminal|Folder|Server|Shield|Globe|Robot|Telescope|Gear|Monitor|HardDrive|Wrench|Network|Rocket|Sparkle|Speedometer|Binoculars|Wand|Package|Sliders|Palette|Lock|Dashboard|Activity|Chart|Docker|Brain|Cpu|Eye/i.test(k)
).sort();
console.log('Tabler relevant:\n' + tnames.join('\n'));
