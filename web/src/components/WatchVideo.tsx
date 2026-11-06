'use client';
import { useCallback,useEffect,useState } from 'react';
import { VideoPlayer,type Playback } from './VideoPlayer';
import type { VideoItem } from './Videos';
export function WatchVideo({id}:{id:string}){
  const [data,setData]=useState<(Playback&{video:VideoItem})|null>(null),[error,setError]=useState('');
  const load=useCallback(async()=>{const response=await fetch('/api/watch/'+id,{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.message || 'Vidéo indisponible.');setData(data);setError('');},[id]);
  useEffect(()=>{let alive=true;fetch('/api/watch/'+id,{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message || 'Vidéo indisponible.');return data;}).then(data=>{if(alive){setData(data);setError('');}}).catch(error=>{if(alive)setError(error.message);});return()=>{alive=false;};},[id]);
  return <section className="panel">{error?<p role="alert" className="notice error">{error}</p>:!data?<p role="status">Ouverture de la vidéo…</p>:<><h1>{data.video.title}</h1><p>{data.video.description}</p>{data.video.driver==='local'&&<p className="notice">Lecture locale de développement.</p>}{data.video.isTest&&<p className="notice">Mux en mode test : extrait et durée de disponibilité limités.</p>}<VideoPlayer playback={data} refresh={()=>void load().catch(error=>setError(error.message))}/></>}</section>;
}
