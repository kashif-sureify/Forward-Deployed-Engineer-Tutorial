const tasks = [];

export function createTask(title) {
    tasks.push(title);
    return 'Task created successfully';
}

export function listTasks() {
    return [...tasks];
}

export function completeTask(title) {
    const index = tasks.indexOf(title);
    if (index !== -1) {
        tasks.splice(index, 1);
        return 'Task completed successfully';
    }
    return 'Task not found';
}