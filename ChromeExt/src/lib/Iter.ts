export namespace Iter {

    export function next<T>(iter: Iterator<T>): null|T
    {
        const { done, value } = iter.next()
        return done ? null : value
    }

    export function* map<In,Out>(iter: Iterator<In>, mapFun: (element: In) => Out): Iterator<Out>
    {
        while (true) {
            const { done, value } = iter.next()
            if (done) {
                return value;
            }
            yield mapFun(value)
        }
    }

    export function fold<In,Out>(iter: Iterator<In>, state: Out, foldFun: (state: Out, element: In) => Out): Out
    {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const {done, value} = iter.next()
            if (done) {
                return state;
            }
            state = foldFun(state, value)
        }
    }

}
