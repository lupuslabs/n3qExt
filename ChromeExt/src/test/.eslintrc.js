module.exports = {
    rules: {
        'no-unused-expressions': 'off', // Because parameter-less Chai assertions are implemented as side effects on property read access.
    }
}
