'use client';
import { useEffect,useRef,useState } from 'react';
export type Playback={url:string;thumbnail:string;type:'mp4'|'hls';expiresIn:number};
export function VideoPlayer({playback,refresh}:{playback:Playback;refresh:()=>void}){
  const ref=useRef<HTMLVideoElement>(null),[error,setError]=useState('');
  const position=useRef(0),paused=useRef(true),renew=useRef(refresh);
  useEffect(()=>{renew.current=refresh;},[refresh]);
  useEffect(()=>{const timer=setInterval(()=>renew.current(),Math.max(30,playback.expiresIn-60)*1000);return()=>clearInterval(timer);},[playback.url,playback.expiresIn]);
  useEffect(()=>{
    const video=ref.current;if(!video)return;let disposed=false,destroy:(()=>void)|undefined;
    const failed=()=>{if(!disposed)setError('La lecture a été interrompue. Actualisez-la pour réessayer.');},loaded=()=>{if(position.current>0)video.currentTime=position.current;if(!paused.current)video.play().catch(()=>{});setError('');};video.addEventListener('error',failed);video.addEventListener('loadedmetadata',loaded,{once:true});
    if(playback.type==='hls' && !video.canPlayType('application/vnd.apple.mpegurl')){
      import('hls.js').then(({default:Hls})=>{if(disposed)return;if(!Hls.isSupported()){failed();return;}const hls=new Hls({enableWorker:false,maxBufferLength:30});hls.loadSource(playback.url);hls.attachMedia(video);hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)failed();});destroy=()=>hls.destroy();}).catch(failed);
    }else video.src=playback.url;
    return()=>{disposed=true;position.current=video.currentTime;paused.current=video.paused;destroy?.();video.pause();video.removeAttribute('src');video.load();video.removeEventListener('error',failed);video.removeEventListener('loadedmetadata',loaded);};
  },[playback]);
  return <div><video className="video-player" ref={ref} controls playsInline preload="metadata" poster={playback.thumbnail}/>{error&&<p role="alert" className="notice error">{error}</p>}<button type="button" className="quiet" onClick={refresh}>Actualiser la lecture</button></div>;
}
