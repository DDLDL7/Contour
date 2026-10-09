import { describe, expect, it } from 'vitest'
import { proportionInference } from './proportions'
import { intervalProbability } from './probability'
import { fitRegression } from './spreadsheet'
import { resolveGeometryPoints, geometryIsConsistent, removeGeometryObjects, projectPointToPath, type GeometryObject } from './geometry'
import { runMathTool } from './mathTools'
import { areNotebookCells } from './notebook'
import { compileGraph } from './math'
import { notebookGraphPaths, notebookInequalityRegion } from './notebookGraph'
import { starterProject, parseProjectFile } from './project'

describe('additional mathematical coverage', () => {
  it('finds an even root that is not on the sample grid', () => {
    const root=runMathTool('solve-numeric','(x-0.1234567)^2',{a:1,start:-1,end:1})
    expect(Number(root.value.split('≈ ')[1])).toBeCloseTo(.1234567,6)
  })
  it('previews implicit contours and inequality regions', () => {
    const bounds={minX:-2,maxX:2,minY:-2,maxY:2}
    expect(notebookGraphPaths(compileGraph('x^2+y^2=1'),bounds,1).length).toBeGreaterThan(10)
    expect(notebookInequalityRegion(compileGraph('x<0'),bounds,1)).toContain('M0,0')
    expect(notebookInequalityRegion(compileGraph('x<0'),bounds,1)).not.toContain('M630,0')
  })
  it('round-trips answer cells and mathematical settings', () => {
    const project=starterProject()
    project.notebook=[{id:'answer',kind:'answer',prompt:'Expand',expected:'(x+1)^2',response:'x^2+2*x+1'}]
    project.spreadsheet={cells:{},regressionKind:'polynomial',polynomialDegree:5}
    project.geometry=[{id:'tangent',kind:'tangent',expressionId:'missing',x:1,color:'red',visible:true}]
    const restored=parseProjectFile(JSON.stringify(project))
    expect(restored.notebook).toEqual(project.notebook)
    expect(restored.spreadsheet.polynomialDegree).toBe(5)
    expect(restored.geometry).toEqual(project.geometry)
    expect(areNotebookCells([{...project.notebook[0],expected:42}])).toBe(false)
  })
  it('matches Wilson interval reference and handles boundary proportions', () => {
    const r = proportionInference(40,100,.5)
    expect(r.lower).toBeCloseTo(.30940128643245896, 7)
    expect(r.upper).toBeCloseTo(.49799741320893826, 7)
    expect(r.statistic).toBeCloseTo(-2, 10)
    expect(r.pValue).toBeCloseTo(.04550026389635839, 7)
    expect(proportionInference(0,10,.5).upper).toBeCloseTo(.2775327998628892, 7)
    expect(proportionInference(10,10,.5).lower).toBeCloseTo(.7224672001371107, 7)
    expect(() => proportionInference(11,10,.5)).toThrow()
  })
  it('uses inclusive integer bounds for probability intervals', () => {
    expect(intervalProbability({ distribution:'normal',firstParameter:0,secondParameter:1 },-1,1)).toBeCloseTo(.682689492137, 7)
    expect(intervalProbability({ distribution:'binomial',firstParameter:2,secondParameter:.5 },1,1)).toBeCloseTo(.5, 10)
    expect(intervalProbability({ distribution:'binomial',firstParameter:2,secondParameter:.5 },.1,.9)).toBe(0)
    expect(() => intervalProbability({ distribution:'normal',firstParameter:0,secondParameter:1 },2,1)).toThrow()
  })
  it('fits higher-degree polynomials without unstable normal equations', () => {
    const points = Array.from({ length: 10 },(_,i) => ({x:1e6+i,y:(i-4)**3-2*i+1}))
    const fit = fitRegression(points, 'polynomial', 3)!
    expect(fit).not.toBeNull()
    for (const point of points) expect(fit.predict(point.x)).toBeCloseTo(point.y, 6)
    expect(fit.rSquared).toBeCloseTo(1, 10)
    expect(fitRegression([{x:1,y:2},{x:1,y:3},{x:1,y:4},{x:1,y:5}], 'polynomial', 3)).toBeNull()
  })
  it('reflects across a dynamic arbitrary line and rejects missing references', () => {
    const objects: GeometryObject[] = [
      ...[[0,0],[1,1],[2,0]].map(([x,y],index) => ({id:String(index),kind:'point' as const,x,y,label:String(index),color:'red',visible:true})),
      {id:'line',kind:'line',startId:'0',endId:'1',color:'red',visible:true},
      {id:'copy',kind:'transform',sourceId:'2',sourceKind:'point',operation:'reflect-line',reflectionLineId:'line',dx:0,dy:0,centerX:0,centerY:0,angleDegrees:0,scale:1,radius:1,color:'blue',visible:true},
    ]
    expect(geometryIsConsistent(objects)).toBe(true)
    const [point] = resolveGeometryPoints(objects,'copy')
    expect(point.x).toBeCloseTo(0,10); expect(point.y).toBeCloseTo(2,10)
    expect(geometryIsConsistent(objects.filter(object => object.id !== 'line'))).toBe(false)
  })
  it('validates constrained points, cascades deletion and rejects dependency cycles', () => {
    const points = [[0,0],[4,2]].map(([x,y],i)=>({id:String(i),kind:'point' as const,x,y,label:String(i),color:'red',visible:true}))
    const path={id:'segment',kind:'segment' as const,startId:'0',endId:'1',color:'red',visible:true}
    const constrained={...points[0],id:'p',onPath:{pathId:'segment',t:.5}}
    const objects: GeometryObject[]=[...points,path,constrained]
    expect(geometryIsConsistent(objects)).toBe(true)
    expect(projectPointToPath(path,new Map(points.map(p=>[p.id,p])),10,10)?.t).toBe(1)
    expect(removeGeometryObjects(objects,['0']).map(p=>p.id)).toEqual(['1'])
    expect(geometryIsConsistent([{...points[0],onPath:{pathId:'segment',t:.5}},points[1],path])).toBe(false)
  })
  it('applies saved two by two matrix transformations', () => {
    const source={id:'p',kind:'point' as const,x:2,y:3,label:'P',color:'red',visible:true}
    const transform: GeometryObject={id:'m',kind:'transform',sourceId:'p',sourceKind:'point',operation:'matrix',matrix:[1,2,0,1],dx:0,dy:0,centerX:0,centerY:0,angleDegrees:0,scale:1,radius:1,color:'blue',visible:true}
    expect(geometryIsConsistent([source,transform])).toBe(true)
    const [point]=resolveGeometryPoints([source,transform],'m')
    expect([point.x,point.y]).toEqual([8,3])
  })

})
