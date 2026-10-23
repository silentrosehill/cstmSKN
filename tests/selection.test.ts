import test from "node:test";
import assert from "node:assert/strict";
import { chooseSkin, chooseCustom, customTargets, loadoutPaths, galleryIndex } from "../src/lib/selection.ts";
import type { Champion, CustomMod } from "../src/types/index.ts";
const champions: Champion[] = [{id:"Ahri",name:"Ahri",key:"103",title:"fox",tags:["Mage"]},{id:"Camille",name:"Camille",key:"164",title:"steel",tags:["Fighter"]},{id:"MonkeyKing",name:"Wukong",key:"62",title:"monkey",tags:["Fighter"]}];
const mods: CustomMod[] = [{name:"Fox",file_path:"/mods/fox.fantome",champions:["ahri","ahri.en_US"],enabled:false},{name:"Other Fox",file_path:"/mods/fox2.fantome",champions:["Ahri"],enabled:false},{name:"Steel",file_path:"/mods/steel.fantome",champions:["camille"],enabled:false},{name:"Unknown",file_path:"/mods/unknown.fantome",champions:["map11"],enabled:false}];
const look = {championName:"Ahri",name:"Spirit Blossom Ahri"};
test("new skin replaces the previous skin only for its champion", () => {
  const before = {skins:{Ahri:"Old Ahri",Camille:"Old Camille"},customs:[]};
  assert.deepEqual(chooseSkin(before,look,true,mods,champions,{}),{skins:{Ahri:look.name,Camille:"Old Camille"},customs:[]});
  assert.equal(before.skins.Ahri,"Old Ahri");
});
test("regular skin disables custom skins targeting that champion", () => {
  assert.deepEqual(chooseSkin({skins:{},customs:["Fox","Steel"]},look,true,mods,champions,{}),{skins:{Ahri:look.name},customs:["Steel"]});
});
test("custom skin replaces a regular skin and another custom for the same champion", () => {
  assert.deepEqual(chooseCustom({skins:{Ahri:"Regular",Camille:"Keep"},customs:["Fox","Steel"]},mods[1],true,mods,champions,{}),{skins:{Camille:"Keep"},customs:["Steel","Other Fox"]});
});
test("Wukong and MonkeyKing resolve to the same champion", () => {
  const mod = {name:"Wukong mod",file_path:"/m",champions:["monkeyking"],enabled:false};
  assert.deepEqual(chooseCustom({skins:{Wukong:"Old"},customs:[]},mod,true,[mod],champions,{}),{skins:{},customs:["Wukong mod"]});
});
test("mods with unknown targets require a champion assignment", () => {
  assert.throws(() => chooseCustom({skins:{},customs:[]},mods[3],true,mods,champions,{}),/Choose a champion/);
  assert.deepEqual(customTargets(mods[3],champions,{}),[]);
});
test("manual custom champion assignment participates in replacement", () => {
  assert.deepEqual(chooseCustom({skins:{Ahri:"Old",Camille:"Keep"},customs:[]},mods[3],true,mods,champions,{Unknown:"Ahri"}),{skins:{Camille:"Keep"},customs:["Unknown"]});
});
test("a mod targeting multiple champions replaces all conflicting picks", () => {
  const mod = {name:"Duo",file_path:"/duo",champions:["ahri","camille"],enabled:false};
  assert.deepEqual(chooseCustom({skins:{Ahri:"Old",Camille:"Old"},customs:["Fox","Steel"]},mod,true,[...mods,mod],champions,{}),{skins:{},customs:["Duo"]});
});
test("disabling a custom leaves other champions and custom mods intact", () => {
  assert.deepEqual(chooseCustom({skins:{Camille:"Keep"},customs:["Fox","Steel"]},mods[0],false,mods,champions,{}),{skins:{Camille:"Keep"},customs:["Steel"]});
});
test("a stale deselection never removes a newer skin", () => {
  assert.deepEqual(chooseSkin({skins:{Ahri:"New skin"},customs:[]},look,false,mods,champions,{}),{skins:{Ahri:"New skin"},customs:[]});
});
test("apply resolves exactly selected files, skips missing downloads, and deduplicates", () => {
  assert.deepEqual(loadoutPaths({skins:{Ahri:"Downloaded",Camille:"Missing"},customs:["Fox"]},[{champion_name:"Ahri",skin_name:"Downloaded",zip_path:"/skin"}],mods),["/skin","/mods/fox.fantome"]);
});
test("gallery wraps left and right without invalid indices", () => {
  assert.equal(galleryIndex(0,3,-1),2); assert.equal(galleryIndex(2,3,1),0); assert.equal(galleryIndex(0,0,-1),0); assert.equal(galleryIndex(0,1,1),0);
});
test("actual archive target takes precedence over a stale manual assignment",()=>{
  assert.deepEqual(customTargets(mods[0],champions,{Fox:"Camille"}),["ahri"]);
});
test("unambiguous champion names can identify an otherwise unlabelled import",()=>{
  const mod={name:"Evelyn Camille",file_path:"/m",champions:[],enabled:false};
  assert.deepEqual(customTargets(mod,champions,{}),["camille"]);
});
test("name detection uses whole words and refuses ambiguous names",()=>{
  const roster=[...champions,{id:"Vi",name:"Vi",key:"254",title:"",tags:[]},{id:"Brand",name:"Brand",key:"63",title:"",tags:[]}];
  assert.deepEqual(customTargets({name:"Divine Ahri",file_path:"/m",enabled:false},roster,{}),["ahri"]);
  assert.deepEqual(customTargets({name:"Brand New Ahri",file_path:"/m",enabled:false},roster,{}),[]);
});
