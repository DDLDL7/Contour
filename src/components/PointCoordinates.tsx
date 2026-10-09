import { useEffect, useState, type FormEvent } from 'react'
import type { GeometryPoint } from '../lib/geometry'

export function PointCoordinates({ point, onChange }: { point:GeometryPoint; onChange:(point:GeometryPoint)=>void }) {
  const [x,setX]=useState(String(point.x));const [y,setY]=useState(String(point.y));const [error,setError]=useState('')
  useEffect(()=>{setX(String(point.x));setY(String(point.y));setError('')},[point.x,point.y])
  if(point.xCell || point.intersectionOf || point.onPath) return <span>{point.label}: dependent point; drag along its path or edit its source construction.</span>
  function submit(event:FormEvent){
    event.preventDefault()
    if(!x.trim() || !y.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {setError('Enter finite coordinates.');return}
    onChange({...point,x:Number(x),y:Number(y)});setError('')
  }
  return <form className="point-coordinate-editor" onSubmit={submit}><span>Point {point.label}</span><label>x<input type="number" step="any" value={x} onChange={event=>setX(event.target.value)} /></label><label>y<input type="number" step="any" value={y} onChange={event=>setY(event.target.value)} /></label><button type="submit">Apply coordinates</button>{error && <span role="alert">{error}</span>}</form>
}
