import { get, merge } from 'object-path-immutable';
import async from 'async';

export interface GeneticOptions<T> {
    mutationFunction: (phenotype: T) => T;
    crossoverFunction: (a: T, b: T) => T;
    fitnessFunction: (phenotype: T) => Promise<number>;
    doesABeatBFunction?: (a: T, b: T) => Promise<boolean>;
    randomFunction?: () => T;
    populationSize: number;
    mutateProbablity?: number;
    deduplicate?: boolean;
}

export class Genetic<T> {
    private options: GeneticOptions<T>;
    private scoreMap: Map<T, number> = new Map();
    private defaults: GeneticOptions<T> = {
        mutationFunction: (phenotype: T): T => phenotype,
        crossoverFunction: (a: T, b: T): T => (Math.random() > 0.5 ? a : b),
        fitnessFunction: async (phenotype: T): Promise<number> => 0,
        randomFunction: (): T =>
            this.mutate((get(this.population, `${Math.floor(Math.random() * this.population.length)}`) as any) as T),
        populationSize: 100,
        mutateProbablity: 0.5,
    };

    private duplicatesMap: Set<string> = new Set();

    constructor(options: GeneticOptions<T>, private population: Array<T> = []) {
        this.options = { ...this.defaults, ...options };
        this.population = population;
    }

    public async evolve() {
        this.scoreMap.clear();
        this.duplicatesMap.clear();

        this.populate();
        this.shufflePopulation();
        await this.compete();
        return this;
    }

    public scoredPopulation(n = 0) {
        return this.population
            .map((phenotype) => ({ phenotype, score: this.scoreMap.get(phenotype) }))
            .filter((a) => a.score)
            .sort((a, b) => (a.score > b.score ? 1 : -1))
            .slice(-n);
    }

    private populate() {
        while (this.population.length < this.options.populationSize) {
            this.population.push(this.options.randomFunction());
        }

        while (this.options.deduplicate && this.duplicatesMap.size !== this.population.length) {
            this.deduplicate();
        }
    }

    private deduplicate() {
        for (let idx = 0; idx < this.population.length; idx++) {
            const phenotype = this.population[idx];
            const hash = JSON.stringify(phenotype);

            if (!this.duplicatesMap.has(hash)) {
                this.duplicatesMap.add(hash);
            } else {
                this.population[idx] = this.options.randomFunction();
            }
        }
    }

    private mutate(phenotype: T): T {
        return this.options.mutationFunction(merge({}, null, phenotype) as T);
    }

    private async fitness(phenotype: T) {
        const score = await this.options.fitnessFunction(phenotype);
        this.scoreMap.set(phenotype, score);
        return score;
    }

    private crossover(phenotype: T) {
        phenotype = merge({}, null, phenotype) as T;
        const mate = get(this.population, `${Math.floor(Math.random() * this.population.length)}`);
        return this.options.crossoverFunction(phenotype, (mate as any) as T);
    }

    private doesABeatB(a: T, b: T): Promise<boolean> {
        if (this.options.doesABeatBFunction) {
            return this.options.doesABeatBFunction(a, b);
        } else {
            return Promise.all([this.fitness(a), this.fitness(b)]).then(([scoreA, scoreB]) => {
                return scoreA >= scoreB;
            });
        }
    }

    private async compete() {
        const tasks = [];

        return new Promise((resolve, reject) => {
            for (let idx = 0; idx < this.population.length - 1; idx += 2) {
                tasks.push(this.task(idx));
            }

            async.parallel(tasks, (err, results) => {
                if (err) {
                    reject(err);
                }

                this.population = results;
                resolve();
            });
        });
    }

    private task(idx: number) {
        return (callback: Function) => {
            const phenotype = this.population[idx];
            const competitor = this.population[idx + 1];

            this.doesABeatB(phenotype, competitor).then((res) => {
                if (res) {
                    if (Math.random() < this.options.mutateProbablity) {
                        callback(null, this.mutate(phenotype));
                    } else {
                        callback(null, this.crossover(phenotype));
                    }
                } else {
                    callback(null, competitor);
                }
            });
        };
    }

    private shufflePopulation() {
        this.population = this.population.sort(() => Math.random() - 0.5);
    }
}