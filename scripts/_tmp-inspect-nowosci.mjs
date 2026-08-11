import {existsSync,readFileSync} from "fs";
import {dirname,join} from "path";
import {fileURLToPath} from "url";
const API_VERSION="2026-04";
const SHOP="epir-art-silver-jewellery.myshopify.com";
const dir=dirname(fileURLToPath(import.meta.url));
function loadToken(){
  for(const rel of["../.dev.vars","../workers/chat/.dev.vars"]){
    const fp=join(dir,rel);
    if(!existsSync(fp)) continue;
    const c=readFileSync(fp,"utf8");
    const m=c.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/)||c.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/);
    if(m) return m[1].trim().replace(/^["']|["']$/g,"");
  }
}
const TOKEN=loadToken();
const endpoint=`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
async function gql(query, variables={}){
  const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":TOKEN},body:JSON.stringify({query,variables})});
  const json=await res.json();
  if(json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
const Q=`query($query:String!){collections(first:5,query:$query){nodes{id handle title updatedAt productsCount{count} ruleSet{rules{column relation condition}} products(first:50){nodes{handle title status vendor productType createdAt}}}}}`;
for(const q of["handle:nowosci-1","title:NOWOŚCI","title:Nowości","handle:nowosci"]){
  const data=await gql(Q,{query:q});
  const nodes=data.collections?.nodes??[];
  console.log("\n---",q,"hits",nodes.length);
  for(const c of nodes){
    console.log(JSON.stringify({handle:c.handle,title:c.title,url:`https://epirbizuteria.pl/collections/${c.handle}`,productsCount:c.productsCount?.count,rules:c.ruleSet?.rules??[],products:(c.products?.nodes??[]).map(p=>({handle:p.handle,title:p.title,status:p.status,vendor:p.vendor,createdAt:p.createdAt?.slice(0,10)}))},null,2));
  }
}
