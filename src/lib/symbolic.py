"""Fixed mathematical commands. Inputs are validated JSON trees, never Python code."""
import json
import sympy as s
from sympy.calculus.util import continuous_domain


def calculate(request):
    o = request['options']
    symbols = {}
    assumptions = {'real': True} if o['domain'] == 'real' else {}
    chosen = dict(assumptions)
    if o['assumption'] != 'none':
        chosen[o['assumption']] = True
    variable = s.Symbol(o['variable'], **chosen)
    symbols[o['variable']] = variable
    constants = {'pi': s.pi, 'e': s.E, 'i': s.I, 'oo': s.oo, 'Infinity': s.oo}
    funcs = {name: getattr(s, name) for name in ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'sqrt', 'factorial', 'floor', 'conjugate', 're', 'im']}
    funcs.update(abs=s.Abs, ceil=s.ceiling, log10=lambda x: s.log(x, 10))
    relations = {'==': s.Eq, '!=': s.Ne, '<': s.Lt, '>': s.Gt, '<=': s.Le, '>=': s.Ge}

    def tree(n):
        k, v = n['kind'], n['value']
        if k == 'number':
            return s.Rational(v)
        if k == 'symbol':
            if v in constants:
                return constants[v]
            if v != o['variable'] and v in o['definitions']:
                return s.Rational(str(o['definitions'][v]))
            if v not in symbols:
                symbols[v] = s.Symbol(v, **assumptions)
            return symbols[v]
        args = [tree(a) for a in n.get('args', [])]
        if k == 'function':
            if v == 'factorial' and args[0].is_number and (not args[0].is_integer or args[0] < 0 or args[0] > 1000):
                raise ValueError('Factorial needs an integer from 0 to 1,000.')
            return funcs[v](*args)
        if v in relations:
            return relations[v](*args, evaluate=False)
        if v == '+':
            return s.Add(*args, evaluate=False)
        if v == '-':
            return -args[0] if len(args) == 1 else s.Add(args[0], -args[1], evaluate=False)
        if v == '*':
            return s.Mul(*args, evaluate=False)
        if v == '/':
            return s.Mul(args[0], s.Pow(args[1], -1, evaluate=False), evaluate=False)
        if v == '^':
            return s.Pow(*args, evaluate=False)
        raise ValueError('Unsupported operation.')

    rows = [[tree(n) for n in row] for row in request['expressions']]
    expr = rows[0][0]
    start, end, initial = [tree(n) for n in request['bounds']]
    method = request['method']
    domain = s.S.Reals if o['domain'] == 'real' else s.S.Complexes
    if o['assumption'] == 'positive': domain=domain.intersect(s.Interval.open(0,s.oo))
    elif o['assumption'] == 'nonnegative': domain=domain.intersect(s.Interval(0,s.oo))
    elif o['assumption'] == 'negative': domain=domain.intersect(s.Interval.open(-s.oo,0))
    elif o['assumption'] == 'nonzero': domain=domain-s.FiniteSet(0)
    notes = [f"Exact symbolic result; variable domain: {o['domain']}."]
    original_domain = None
    if o['assumption'] != 'none':
        notes.append(f"Assumption: {variable} is {o['assumption']}.")
    if method not in ['system', 'inequality', 'matrix', 'ode'] and o['domain'] == 'real':
        target = expr.lhs - expr.rhs if isinstance(expr, s.Equality) else expr
        try:
            original_domain=continuous_domain(target, variable, s.S.Reals)
            notes.append(f"Original expression is continuous on: {original_domain}.")
        except (NotImplementedError, ValueError, TypeError):
            notes.append('Full original-expression domain could not be established.')
    def equation(e):
        return (e.lhs - e.rhs if isinstance(e, s.Equality) else e).doit()
    if method == 'exact':
        result = s.simplify(expr)
        if not result.free_symbols:
            notes.append(f"Decimal approximation: {s.N(result, 14)}.")
    elif method in ['simplify', 'expand', 'factor']:
        result = getattr(s, method)(expr)
    elif method == 'rational':
        result = s.cancel(s.together(expr))
    elif method == 'trig':
        result = s.trigsimp(expr)
    elif method == 'substitute':
        result = s.simplify(expr.subs(variable, end))
    elif method == 'solve':
        result = s.solveset(equation(expr), variable, domain=domain)
        # Preserve holes in the original unevaluated input after simplification.
        for part in s.preorder_traversal(expr):
            if isinstance(part, s.Pow) and part.exp.is_negative:
                excluded = s.solveset(part.base, variable, domain=domain)
                result = result - excluded
    elif method == 'system':
        equations = [equation(row[0]) for row in rows]
        unknowns = sorted(set().union(*(e.free_symbols for e in equations)), key=str)
        if not unknowns:
            raise ValueError('The system has no unknown variables.')
        result = s.nonlinsolve(equations, unknowns)
        if isinstance(result, s.FiniteSet):
            def permitted(item):
                if o['domain'] == 'real' and any(v.is_real is False for v in item):
                    return False
                if variable in unknowns and o['assumption'] != 'none':
                    value = item[unknowns.index(variable)]
                    if getattr(value, 'is_' + o['assumption']) is False:
                        return False
                return True
            result = s.FiniteSet(*(item for item in result if permitted(item)))
            notes.append('Discarded solutions that provably violate the selected domain or variable assumption; undecidable conditions remain symbolic.')
        notes.append('Tuple order: ' + ', '.join(map(str, unknowns)) + '.')
    elif method == 'envelope':
        if o['variable'] in ['x','y']:
            raise ValueError('Choose the family parameter as the variable, for example t.')
        x=symbols.setdefault('x',s.Symbol('x',**assumptions)); y=symbols.setdefault('y',s.Symbol('y',**assumptions))
        family=equation(expr)
        result=s.nonlinsolve([family,s.diff(family,variable)],[x,y])
        notes.append('Tuple order: x, y. Solves F(x,y,t)=0 and ∂F/∂t=0. Singular family members may introduce extra candidates; restrict the parameter and verify the geometric envelope.')
    elif method == 'inequality':
        if o['domain'] != 'real':
            raise ValueError('Ordered inequalities require the real domain.')
        if any(not isinstance(row[0],s.core.relational.Relational) for row in rows):
            raise ValueError('Enter comparisons such as x > 0 or x^2 <= 4.')
        result = s.reduce_inequalities([row[0] for row in rows], variable)
        if isinstance(result, s.Basic):
            allowed = domain
            for row in rows:
                for part in s.preorder_traversal(row[0]):
                    if isinstance(part, s.Pow) and part.exp.is_negative:
                        allowed -= s.solveset(part.base, variable, domain=s.S.Reals)
            result = result.as_set().intersect(allowed)
    elif method == 'differentiate':
        result = s.diff(expr, variable)
        notes.append('Product, chain, power, and function rules are applied symbolically.')
    elif method == 'differentiate-steps':
        lines=[]
        def explain(e):
            if len(lines)>60:
                raise ValueError('Too many derivative steps. Use a smaller expression.')
            if not e.has(variable):
                lines.append(f'Constant rule: d/d{variable}({e}) = 0')
            elif e == variable:
                lines.append(f'Variable rule: d/d{variable}({e}) = 1')
            elif isinstance(e, s.Add):
                lines.append(f'Sum rule: differentiate each term of {e}.')
                for part in e.args: explain(part)
            elif isinstance(e, s.Mul):
                lines.append(f'Product rule: in {e}, differentiate one factor at a time and sum the products.')
                for part in e.args: explain(part)
            elif isinstance(e, s.Pow):
                lines.append(f"{'Power and chain rules' if not e.exp.has(variable) else 'Logarithmic differentiation for variable powers'}: d/d{variable}({e}) = {s.diff(e,variable)}")
                explain(e.base)
            elif e.is_Function and len(e.args)==1:
                lines.append(f'Function and chain rules: d/d{variable}({e}) = {s.diff(e,variable)}')
                explain(e.args[0])
            else:
                raise ValueError('Worked differentiation supports sums, products, powers, and single-argument functions.')
        explain(expr.doit())
        lines.append(f'Combine and simplify: {s.simplify(s.diff(expr,variable))}')
        result='\n'.join(f'{i+1}. {line}' for i,line in enumerate(lines))
    elif method == 'asymptotes':
        lines=[]
        for infinity in [-s.oo,s.oo]:
            slope=s.limit(expr/variable,variable,infinity)
            if slope.is_finite and not slope.has(variable):
                intercept=s.limit(expr-slope*variable,variable,infinity)
                if intercept.is_finite and not intercept.has(variable):
                    lines.append(f'As {variable} → {infinity}: y = {s.simplify(slope*variable+intercept)}')
        candidates=s.singularities(expr,variable,domain=domain)
        if isinstance(candidates,s.FiniteSet):
            for value in candidates:
                left=s.limit(expr,variable,value,dir='-'); right=s.limit(expr,variable,value,dir='+')
                if left in [s.oo,-s.oo] or right in [s.oo,-s.oo]:
                    lines.append(f'Vertical: {variable} = {value}; left {left}, right {right}')
        elif candidates!=s.S.EmptySet:
            lines.append(f'Unenumerated singularity candidates: {candidates}; vertical limits were not verified for this family.')
        result='\n'.join(lines) or 'No linear asymptote was established by these tests.'
        notes.append('Uses limits at ±infinity and singularity candidates; branch-boundary singularities may require separate checking.')
    elif method == 'integrate':
        result = s.integrate(expr, variable)
        notes.append('Add an arbitrary constant C to an antiderivative; validity may depend on interval and branch.')
    elif method == 'definite':
        result = s.integrate(expr, (variable, start, end))
        notes.append('Improper integrals may diverge; no Cauchy principal value is requested.')
    elif method == 'limit':
        if original_domain is not None and start.is_real and start.is_finite:
            sides=['left','right'] if o['direction']=='both' else [o['direction']]
            for side in sides:
                nearby=s.Interval.open(start-s.Rational(1,1000000),start) if side=='left' else s.Interval.open(start,start+s.Rational(1,1000000))
                if original_domain.intersect(nearby) == s.S.EmptySet:
                    raise ValueError(f'The original real expression has no domain values near the approach point on the {side}; this requested limit is not defined.')
        if o['direction'] == 'both' and start not in [s.oo, -s.oo]:
            left = s.limit(expr, variable, start, dir='-')
            right = s.limit(expr, variable, start, dir='+')
            if s.simplify(left - right) != 0 and left != right:
                return {'title': 'Two-sided limit', 'value': f'Does not exist.\nLeft: {left}\nRight: {right}', 'note': 'Computed the two one-sided limits separately.'}
            result = right
        else:
            result = s.limit(expr, variable, start, dir='-' if o['direction'] == 'left' else '+')
    elif method == 'series':
        result = s.series(expr, variable, start, o['order'])
        notes.append('The order term records the truncation; this is a local expansion, not a global approximation.')
    elif method in ['gradient', 'hessian']:
        axes = [symbols.setdefault(name, s.Symbol(name, **assumptions)) for name in ['x', 'y', 'z']]
        result = s.Matrix([s.diff(expr, axis) for axis in axes]) if method == 'gradient' else s.hessian(expr, axes)
        notes.append('Coordinate order: x, y, z.')
    elif method == 'matrix':
        matrix = s.Matrix(rows)
        reduced, pivots = matrix.rref()
        lines = [f'Rank: {matrix.rank()}', f'RREF: {reduced}', f'Pivot columns (1-based): {tuple(i+1 for i in pivots)}']
        if matrix.rows == matrix.cols:
            determinant = s.simplify(matrix.det())
            lines.append(f'Determinant: {determinant}')
            lines.append(f'Inverse: {matrix.inv()}' if determinant != 0 else 'Inverse does not exist: singular matrix.')
            lines.append(f'Eigenvalues (value: multiplicity): {matrix.eigenvals()}')
            lines.append(f'Eigenvectors (value, multiplicity, basis): {matrix.eigenvects()}')
        result = '\n'.join(lines)
        notes.append('Symbolic pivots and inverses apply generically where their denominators are nonzero.')
    elif method == 'ode':
        y = s.Function('y')(variable)
        rhs = expr.subs(symbols.get('y', s.Symbol('y', **assumptions)), y)
        result = s.dsolve(s.Eq(s.diff(y, variable), rhs), y, ics={y.subs(variable, start): initial})
        notes.append('First-order dy/dx = input, with the chosen initial condition. Check singularities and solution interval.')
    elif method == 'check':
        difference = s.simplify(expr - rows[1][0])
        result = 'Equivalent where both expressions are defined.' if difference == 0 else ('Not equivalent.' if difference.is_zero is False else 'Could not establish equivalence.')
        notes.append('This checks symbolic equality, not matching domains or a complete proof of a student derivation.')
    elif method == 'steps':
        polynomial = s.Poly(s.expand(equation(expr)), variable)
        degree = polynomial.degree()
        if degree not in [1, 2] or any(c.free_symbols for c in polynomial.all_coeffs()):
            raise ValueError('Worked equation steps support numeric linear and quadratic equations.')
        if degree == 1:
            a, b = polynomial.all_coeffs()
            result = f'1. Collect terms: {a}*{variable} + ({b}) = 0\n2. Subtract the constant: {a}*{variable} = {-b}\n3. Divide by {a}: {variable} = {s.simplify(-b/a)}'
        else:
            a, b, c = polynomial.all_coeffs()
            disc = s.simplify(b*b-4*a*c)
            roots = s.solveset(polynomial.as_expr(), variable, domain=domain)
            result = f'1. Collect terms: {polynomial.as_expr()} = 0\n2. a = {a}, b = {b}, c = {c}\n3. Discriminant b^2 - 4ac = {disc}\n4. Use (-b ± sqrt(discriminant))/(2a)\n5. Solutions in the selected domain: {roots}'
    else:
        raise ValueError('Unsupported symbolic method.')
    if isinstance(result, s.Basic) and result.has(s.Integral, s.ConditionSet, s.Derivative):
        notes.append('An unevaluated term or conditional solution remains: this is not a completed closed-form answer.')
    value = str(result).replace('**', '^')
    if len(value) > 30000:
        raise ValueError('Result is too large to display. Reduce the expression or matrix size.')
    return {'title': method.replace('-', ' ').title(), 'value': value, 'note': ' '.join(notes)}


json.dumps(calculate(json.loads(request_json)))
