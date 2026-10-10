import { graphColors, type Project } from './project'
import { activeSpreadsheetSheet, spreadsheetSheets } from './spreadsheet'
import { areActivitySteps, type ActivityStep, type NotebookCell } from './notebook'

export type ActivityTemplate = 'parameter' | 'data' | 'linear' | 'trigonometry' | 'limits' | 'derivatives' | 'integration' | 'inequalities' | 'parametric' | 'surfaces'
export const activityTemplates: { id: ActivityTemplate; label: string; cells: number }[] = [
  { id: 'parameter', label: 'Explore a quadratic', cells: 5 },
  { id: 'data', label: 'Build a data model', cells: 4 },
  { id: 'linear', label: 'Slope and intercept', cells: 5 },
  { id: 'trigonometry', label: 'Amplitude and period', cells: 5 },
  { id: 'limits', label: 'A removable discontinuity', cells: 5 },
  { id: 'derivatives', label: 'Derivatives and turning points', cells: 5 },
  { id: 'integration', label: 'Antiderivatives and area', cells: 5 },
  { id: 'inequalities', label: 'Equations and shaded regions', cells: 5 },
  { id: 'parametric', label: 'A parametric circle', cells: 5 },
  { id: 'surfaces', label: 'Explore a 3D surface', cells: 5 },

]

/** Append one linked activity as a single undoable edit; existing work is preserved. */
export function appendActivity(project: Project, template: ActivityTemplate): Project {
  const description = activityTemplates.find((item) => item.id === template)
  if (!description || project.notebook.length + description.cells > 60) return project
  if (template === 'data' && spreadsheetSheets(project.spreadsheet).length >= 20) return project
  const expressionId = crypto.randomUUID()
  const cell = (value: Omit<Extract<NotebookCell, { kind: 'text' }>, 'id'>): NotebookCell => ({ id: crypto.randomUUID(), ...value })
  const graph: NotebookCell = { id: crypto.randomUUID(), kind: 'graph', expressionId }
  let notebook: NotebookCell[]
  let spreadsheet = project.spreadsheet
  if (template === 'parameter') {
    notebook = [
      cell({ kind: 'text', content: 'Explore y = ax²\nPredict how the curve changes when a is positive, zero or negative. The current value is {{a}}. Choose values within your parameter range.' }),
      { id: crypto.randomUUID(), kind: 'input', label: 'Choose a', parameterName: 'a' },
      graph,
      { id: crypto.randomUUID(), kind: 'calculation', operation: 'differentiate', expression: 'a*x^2' },
      cell({ kind: 'text', content: 'Explain your result\nHow does the derivative describe the slope on either side of x = 0? What changes when a = 0? Write your observations here.' }),
    ]
  } else if (template === 'data') {
    const sheets = spreadsheetSheets(spreadsheet)
    const active = activeSpreadsheetSheet(spreadsheet)
    const sheetId = crypto.randomUUID()
    let name = 'Activity data'; let suffix = 2
    while (sheets.some((sheet) => sheet.name.toLowerCase() === name.toLowerCase())) name = `Activity data ${suffix++}`
    spreadsheet = { ...spreadsheet, cells: active.cells, activeSheetId: active.id, sheets: [...sheets, { id: sheetId, name, cells: { A1: 'x', B1: 'y', A2: '0', B2: '=a*A2+1', A3: '1', B3: '=a*A3+1', A4: '2', B4: '=a*A4+1', A5: '3', B5: '=a*A5+1' } }] }
    notebook = [
      cell({ kind: 'text', content: 'Build a data model\nThis example uses y = ax + 1. Edit column A or parameter a and watch the formulas in column B update. The new sheet is separate from your existing data.' }),
      { id: crypto.randomUUID(), kind: 'table', sheetId },
      graph,
      cell({ kind: 'text', content: 'Compare and explain\nDo the calculated pairs lie on the line? Change a formula or edit the linked equation, then explain when the table and graph agree.' }),
    ]
  }
  else {
    const lesson = lessons[template]
    notebook = [
      cell({ kind:'text', content:lesson.introduction }),
      graph,
      cell({ kind:'text', content:lesson.investigation }),
      { id:crypto.randomUUID(),kind:'answer',prompt:lesson.question,expected:lesson.expected,response:'' },
      cell({ kind:'text',content:lesson.reflection }),
    ]
  }
  return { ...project, spreadsheet, expressions: [...project.expressions, { id: expressionId, text: template === 'parameter' ? 'y = a*x^2' : template === 'data' ? 'y = a*x+1' : lessons[template].expression, visible: true, color: graphColors[project.expressions.length % graphColors.length] }], notebook: [...project.notebook, ...notebook] }
}

interface Lesson { expression:string; introduction:string; investigation:string; question:string; expected:string; reflection:string }
const lessons: Record<Exclude<ActivityTemplate,'parameter'|'data'>,Lesson> = {
  linear: {
    expression:'y = 2*x+1', introduction:'Slope and intercept\nLearning goal: connect a linear equation to its graph. Predict where y = 2x + 1 crosses each axis before inspecting the graph.',
    investigation:'Investigate\nRead y at x = 0 and x = 1. Change the coefficient of x, then the constant. Which edit changes slope? Which translates the line? Keep a record of each prediction and observation.',
    question:'For the original equation y = 2x + 1, enter the x-coordinate of the x-intercept.',expected:'-1/2',reflection:'Explain\nShow how you found the intercept algebraically. How could you check it by substitution? Write your reasoning here.',
  },
  trigonometry: {
    expression:'y = 2*sin(3*x)',introduction:'Amplitude and period\nLearning goal: separate vertical scaling from horizontal frequency. Predict the range and period of y = 2 sin(3x). Angles are in radians.',
    investigation:'Investigate\nFind two consecutive peaks. Change 2 to 1, then change 3 to 2. Describe which distances change. Restore the original equation before answering.',
    question:'Enter the period of y = 2 sin(3x).',expected:'2*pi/3',reflection:'Explain\nWhy does multiplying x by 3 shorten the period? Include the function range and a labelled sketch in your explanation.',
  },
  limits: {
    expression:'y = sin(x)/x',introduction:'A removable discontinuity\nLearning goal: distinguish a function value from a limit. The formula sin(x)/x is undefined at x = 0, with angles in radians.',
    investigation:'Investigate\nUse the exact limit tool with left, right and both approaches to 0. Compare nearby values at ±0.1 and ±0.01. The sampled preview can miss a single undefined point; the drawn curve does not define f(0).',
    question:'Enter the two-sided limit of sin(x)/x as x approaches 0.',expected:'1',reflection:'Explain\nCompare the limit with f(0). How would defining f(0) = 1 change continuity without changing any other function values?',
  },
  derivatives: {
    expression:'y = x^3-x',introduction:'Derivatives and turning points\nLearning goal: connect derivative signs with increasing and decreasing behaviour. Predict the shape of y = x³ − x.',
    investigation:'Investigate\nUse worked derivative steps to differentiate x^3-x. Solve f′(x) = 0, then check the sign on either side of each solution. Use graph analysis to compare approximate turning points.',
    question:'Enter the derivative of x^3-x with respect to x.',expected:'3*x^2-1',reflection:'Explain\nWhich stationary point is a maximum, and which is a minimum? Support your answer with derivative signs rather than the picture alone.',
  },
  integration: {
    expression:'y = x^2',introduction:'Antiderivatives and area\nLearning goal: connect antiderivatives and definite integrals. Predict the area under y = x² from 0 to 1.',
    investigation:'Investigate\nFind an antiderivative in Exact symbolic tools, then evaluate the definite integral with bounds 0 and 1. Differentiate your antiderivative to check it. Explain the role of the arbitrary constant.',
    question:'Enter an antiderivative of x^2 whose value at x = 0 is 0.',expected:'x^3/3',reflection:'Explain\nUse F(1) − F(0) to find the area. Why does the arbitrary constant cancel? Write the calculation and units here.',
  },
  inequalities: {
    expression:'x^2+y^2<=4',introduction:'Equations and shaded regions\nLearning goal: interpret a two-variable inequality. Predict the boundary and shaded side for x² + y² ≤ 4.',
    investigation:'Investigate\nTest (0,0), (2,0) and (3,0) in the inequality. Change ≤ to <. What happens to the boundary? Compare with x² + y² = 4.',
    question:'Enter the area of the region x^2+y^2 <= 4.',expected:'4*pi',reflection:'Explain\nDescribe which points belong to the region and which belong to its boundary. Why does removing only the boundary leave the area unchanged?',
  },
  parametric: {
    expression:'x = 2*cos(t), y = 2*sin(t)',introduction:'A parametric circle\nLearning goal: connect a parameter to coordinates. The preview uses 0 ≤ t ≤ 2π. Predict the path of (2 cos t, 2 sin t).',
    investigation:'Investigate\nFind the point at t = 0, π/2, π and 3π/2. Use cos²t + sin²t = 1 to eliminate t. What changes if only the x-coordinate is multiplied by 2?',
    question:'Enter x^2+y^2 for the original parametric curve.',expected:'4',reflection:'Explain\nState the direction of travel as t increases and the time needed for one complete circuit. Compare a circle with the modified ellipse.',
  },
  surfaces: {
    expression:'z = x^2+y^2',introduction:'Explore a 3D surface\nLearning goal: connect surface equations with plane sections. Predict the shape of z = x² + y². Open the 3D preview and rotate it.',
    investigation:'Investigate\nIn the 3D workspace, use Slice to compare z = 1, x = 0 and y = 0 sections. Describe the curves and verify them by substituting into the equation.',
    question:'Enter the radius of the section z = 4.',expected:'2',reflection:'Explain\nWhy are horizontal sections circles while vertical sections are parabolas? Describe what happens for a negative z section.',
  },
}

/** A bounded declarative script: validate the whole sequence before changing anything. */
export function runActivitySteps(project:Project,steps:ActivityStep[]):Project {
  if(!areActivitySteps(steps))throw new Error('Use one to twenty supported activity steps.')
  for(const step of steps) {
    if(step.action==='set-parameter') {
      const range=step.parameterName==='a'?project.parameterARange:project.parameters.find(p=>p.name===step.parameterName)
      if(!range)throw new Error(`Parameter ${step.parameterName} is missing. Choose an existing parameter.`)
      if(step.value<range.min || step.value>range.max)throw new Error(`Parameter ${step.parameterName} must be between ${range.min} and ${range.max}.`)
    } else if(!project.expressions.some(row=>row.id===step.expressionId))throw new Error('A linked graph is missing. Choose an existing expression.')
  }
  let next=project
  for(const step of steps) {
    next=step.action==='set-visibility'?{...next,expressions:next.expressions.map(row=>row.id===step.expressionId?{...row,visible:step.visible}:row)}
      :step.parameterName==='a'?{...next,parameterA:step.value}:{...next,parameters:next.parameters.map(p=>p.name===step.parameterName?{...p,value:step.value}:p)}
  }
  return next
}
