import {readFileSync,writeFileSync} from 'node:fs';
const fixes=[
 ['src/components/factory-app.tsx','</Link></Button>}/>}</main>','</Link></Button>}/>}</>}</main>'],
 ['src/components/forms.tsx',"setFormError((e as Error).message);}}/>","setFormError((e as Error).message);}}}/>"],
 ['src/components/settings.tsx',"e.target.value.split(',').map(x=>x.trim())})}/></Field><label", "e.target.value.split(',').map(x=>x.trim())})}/></Field>}<label"],
];
for(const [file,from,to] of fixes){const text=readFileSync(file,'utf8');if(!text.includes(from))throw new Error(file);writeFileSync(file,text.replace(from,to));}
